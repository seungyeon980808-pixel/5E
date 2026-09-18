#include "core.h"
#include <stdlib.h>
#include <string.h>

static bool ascii_equal(const char *a, const char *b) {
    for (; *a && *b; a++, b++) {
        unsigned char x = (unsigned char)*a, y = (unsigned char)*b;
        if (x >= 'A' && x <= 'Z') x += 'a' - 'A';
        if (y >= 'A' && y <= 'Z') y += 'a' - 'A';
        if (x != y) return false;
    }
    return *a == *b;
}

bool endpoint_parse(const char *url, bool origin_only, Endpoint *out) {
    if (!url || strlen(url) >= sizeof(out->origin)) return false;
    const char *start;
    if (!strncmp(url, "https://", 8)) { out->secure = true; start = url + 8; }
    else if (!strncmp(url, "http://", 7)) { out->secure = false; start = url + 7; }
    else return false;
    for (const char *p = url; *p; p++) if ((unsigned char)*p <= 32 || *p == '\\' || (unsigned char)*p == 127) return false;
    const char *end = start + strcspn(start, "/?#");
    if (end == start || (origin_only && *end && strcmp(end, "/"))) return false;
    const char *host_end = end, *port = NULL;
    bool ipv6 = *start == '[';
    if (ipv6) {
        const char *close = strchr(start, ']');
        if (!close || close >= end) return false;
        start++; host_end = close;
        if (close + 1 != end) { if (close[1] != ':') return false; port = close + 2; }
    } else {
        const char *colon = memchr(start, ':', (size_t)(end - start));
        if (colon) { host_end = colon; port = colon + 1; }
    }
    size_t host_size = (size_t)(host_end - start);
    if (!host_size || host_size >= sizeof(out->host)) return false;
    for (const char *p = start; p < host_end; p++) {
        bool letter = (*p >= 'a' && *p <= 'z') || (*p >= 'A' && *p <= 'Z');
        bool digit = *p >= '0' && *p <= '9';
        if (!letter && !digit && *p != '.' && *p != '-' && !(ipv6 && *p == ':')) return false;
    }
    memcpy(out->host, start, host_size); out->host[host_size] = 0;
    unsigned number = out->secure ? 443 : 80;
    if (port) {
        if (port == end) return false;
        number = 0;
        for (const char *p = port; p < end; p++) {
            if (*p < '0' || *p > '9' || number > 6553) return false;
            number = number * 10 + (unsigned)(*p - '0');
        }
        if (!number || number > 65535) return false;
    }
    if (!out->secure && !ascii_equal(out->host, "localhost") && strcmp(out->host, "127.0.0.1") && strcmp(out->host, "::1")) return false;
    out->port = (uint16_t)number;
    size_t origin_size = (size_t)(end - url);
    memcpy(out->origin, url, origin_size); out->origin[origin_size] = 0;
    return true;
}

bool launch_url_valid(const Endpoint *editor, const char *url) {
    Endpoint target;
    if (!endpoint_parse(url, false, &target) || target.secure != editor->secure || target.port != editor->port || !ascii_equal(target.host, editor->host)) return false;
    const char *fragment = strchr(url, '#');
    if (!fragment || strncmp(fragment, "#project=", 9) || strlen(fragment + 9) != 48) return false;
    for (const char *p = fragment + 9; *p; p++) if (!(*p >= '0' && *p <= '9') && !(*p >= 'a' && *p <= 'f')) return false;
    return true;
}

static uint32_t little32(const uint8_t *p) {
    return (uint32_t)p[0] | (uint32_t)p[1] << 8 | (uint32_t)p[2] << 16 | (uint32_t)p[3] << 24;
}

static cJSON *parse_json(const uint8_t *bytes, size_t size) {
    const char *end = NULL;
    cJSON *value = cJSON_ParseWithLengthOpts((const char *)bytes, size, &end, false);
    if (!value) return NULL;
    while (end < (const char *)bytes + size && (*end == ' ' || *end == '\r' || *end == '\n' || *end == '\t')) end++;
    if (end != (const char *)bytes + size) { cJSON_Delete(value); return NULL; }
    return value;
}

bool project_parse(const uint8_t *data, size_t length, Hash256 hash, Project *out) {
    memset(out, 0, sizeof(*out));
    if (length < 256 || length > EXE_LIMIT || memcmp(data, "MZ", 2)) return false;
    uint32_t pe = little32(data + 60);
    if ((size_t)pe + 176 > length || little32(data + pe) != 0x4550 || data[pe + 4] != 0x64 || data[pe + 5] != 0x86 || data[pe + 24] != 0x0b || data[pe + 25] != 2) return false;
    uint32_t certificate = little32(data + pe + 168), certificate_size = little32(data + pe + 172);
    size_t end = certificate ? certificate : length;
    if (end > length || (certificate && (uint64_t)certificate + certificate_size > length)) return false;
    const uint8_t *footer = NULL;
    // Authenticode can insert up to seven alignment bytes before its certificate.
    for (size_t padding = 0; padding < 8 && end >= padding + FOOTER_SIZE; padding++) {
        const uint8_t *candidate = data + end - padding - FOOTER_SIZE;
        if (!memcmp(candidate, "5EPRJWIN00000001", 16)) { footer = candidate; break; }
        if (data[end - padding - 1]) break;
    }
    if (!footer) return false;
    uint32_t source_size = little32(footer + 16), config_size = little32(footer + 20);
    size_t total = (size_t)source_size + config_size;
    if (!source_size || source_size > PROJECT_LIMIT || !config_size || config_size > 65536 || total > (size_t)(footer - data)) return false;
    const uint8_t *body = footer - total;
    uint8_t digest[32];
    if (!hash(body, total, digest) || memcmp(digest, footer + 24, 32)) return false;
    cJSON *document = parse_json(body, source_size), *config = parse_json(body + source_size, config_size);
    bool valid = cJSON_IsObject(document) && (cJSON_IsArray(cJSON_GetObjectItemCaseSensitive(document, "pages")) || cJSON_IsArray(cJSON_GetObjectItemCaseSensitive(document, "objects")));
    cJSON_Delete(document);
    const cJSON *server = cJSON_GetObjectItemCaseSensitive(config, "server"), *editor = cJSON_GetObjectItemCaseSensitive(config, "editorOrigin");
    if (!valid || !cJSON_IsObject(config) || !cJSON_IsString(server) || !cJSON_IsString(editor) || !endpoint_parse(server->valuestring, true, &out->server) || !endpoint_parse(editor->valuestring, true, &out->editor)) { cJSON_Delete(config); return false; }
    out->json = body; out->length = source_size; out->config = config;
    return true;
}

void project_close(Project *project) { cJSON_Delete(project->config); project->config = NULL; }

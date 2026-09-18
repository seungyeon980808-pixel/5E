#ifndef FIVE_E_CORE_H
#define FIVE_E_CORE_H
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "vendor/cJSON.h"
#define PROJECT_LIMIT (32u * 1024u * 1024u)
#define EXE_LIMIT (64u * 1024u * 1024u)
#define FOOTER_SIZE 56u

typedef struct { char host[256], origin[1024]; uint16_t port; bool secure; } Endpoint;
typedef struct { const uint8_t *json; uint32_t length; cJSON *config; Endpoint server, editor; } Project;
typedef bool (*Hash256)(const uint8_t *, size_t, uint8_t[32]);
bool endpoint_parse(const char *url, bool origin_only, Endpoint *out);
bool launch_url_valid(const Endpoint *editor, const char *url);
bool project_parse(const uint8_t *data, size_t length, Hash256 hash, Project *out);
void project_close(Project *project);
bool argument_append(char *buffer, size_t capacity, const char *argument);
#endif

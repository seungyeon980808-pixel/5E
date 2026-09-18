#include "windows.h"
#include <winhttp.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

typedef struct { HANDLE event, closed; DWORD status, actual; ULONGLONG deadline; } Transfer;

static void CALLBACK transfer_status(HINTERNET handle, DWORD_PTR context, DWORD status, LPVOID information, DWORD length) {
    (void)handle;
    if (!context) return;
    Transfer *transfer = (Transfer *)context;
    if (status == WINHTTP_CALLBACK_STATUS_HANDLE_CLOSING) { SetEvent(transfer->closed); return; }
    transfer->actual = 0;
    if (status == WINHTTP_CALLBACK_STATUS_DATA_AVAILABLE && length == sizeof(DWORD)) transfer->actual = *(DWORD *)information;
    if (status == WINHTTP_CALLBACK_STATUS_READ_COMPLETE) transfer->actual = length;
    transfer->status = status;
    SetEvent(transfer->event);
}

static bool completed(Transfer *transfer, BOOL started, DWORD expected) {
    if (!started && GetLastError() != ERROR_IO_PENDING) return false;
    ULONGLONG now = GetTickCount64();
    if (now >= transfer->deadline) return false;
    return WaitForSingleObject(transfer->event, (DWORD)(transfer->deadline - now)) == WAIT_OBJECT_0 && transfer->status == expected;
}

bool web_transfer(const Project *project, char **address) {
    bool valid = false, callback_set = false;
    *address = NULL;
    Transfer transfer = { .deadline = GetTickCount64() + 35000 };
    transfer.event = CreateEventW(NULL, FALSE, FALSE, NULL);
    transfer.closed = CreateEventW(NULL, FALSE, FALSE, NULL);
    wchar_t *host = wide_from_utf8(project->server.host), *origin = wide_from_utf8(project->server.origin);
    HINTERNET session = NULL, connection = NULL, request = NULL;
    char *response = NULL;
    cJSON *parsed = NULL;
    if (!transfer.event || !transfer.closed || !host || !origin) goto done;
    session = WinHttpOpen(L"5E project launcher/1.0", WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, WINHTTP_FLAG_ASYNC);
    if (!session || !WinHttpSetTimeouts(session, 5000, 10000, 10000, 10000)) goto done;
    DWORD protocols = WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_2 | WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_3;
    if (!WinHttpSetOption(session, WINHTTP_OPTION_SECURE_PROTOCOLS, &protocols, sizeof(protocols))) {
        protocols = WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_2;
        if (!WinHttpSetOption(session, WINHTTP_OPTION_SECURE_PROTOCOLS, &protocols, sizeof(protocols))) goto done;
    }
    DWORD retries = 1;
    if (!WinHttpSetOption(session, WINHTTP_OPTION_CONNECT_RETRIES, &retries, sizeof(retries))) goto done;
    connection = WinHttpConnect(session, host, project->server.port, 0);
    if (!connection) goto done;
    request = WinHttpOpenRequest(connection, L"POST", L"/api/project-launch", NULL, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, project->server.secure ? WINHTTP_FLAG_SECURE : 0);
    if (!request) goto done;
    DWORD_PTR context = (DWORD_PTR)&transfer;
    if (!WinHttpSetOption(request, WINHTTP_OPTION_CONTEXT_VALUE, &context, sizeof(context))) goto done;
    DWORD notifications = WINHTTP_CALLBACK_FLAG_SENDREQUEST_COMPLETE | WINHTTP_CALLBACK_FLAG_HEADERS_AVAILABLE | WINHTTP_CALLBACK_FLAG_DATA_AVAILABLE | WINHTTP_CALLBACK_FLAG_READ_COMPLETE | WINHTTP_CALLBACK_FLAG_REQUEST_ERROR | WINHTTP_CALLBACK_FLAG_HANDLES;
    if (WinHttpSetStatusCallback(request, transfer_status, notifications, 0) == WINHTTP_INVALID_STATUS_CALLBACK) goto done;
    callback_set = true;
    DWORD disabled = WINHTTP_DISABLE_COOKIES | WINHTTP_DISABLE_REDIRECTS | WINHTTP_DISABLE_AUTHENTICATION;
    DWORD autologon = WINHTTP_AUTOLOGON_SECURITY_LEVEL_HIGH;
    if (!WinHttpSetOption(request, WINHTTP_OPTION_DISABLE_FEATURE, &disabled, sizeof(disabled)) || !WinHttpSetOption(request, WINHTTP_OPTION_AUTOLOGON_POLICY, &autologon, sizeof(autologon))) goto done;
    wchar_t headers[2048];
    if (swprintf(headers, 2048, L"Content-Type: application/json\r\nX-5E-Request: 1\r\nOrigin: %ls\r\n", origin) < 0) goto done;
    ResetEvent(transfer.event);
    if (!completed(&transfer, WinHttpSendRequest(request, headers, (DWORD)-1L, (LPVOID)project->json, project->length, project->length, context), WINHTTP_CALLBACK_STATUS_SENDREQUEST_COMPLETE)) goto done;
    ResetEvent(transfer.event);
    if (!completed(&transfer, WinHttpReceiveResponse(request, NULL), WINHTTP_CALLBACK_STATUS_HEADERS_AVAILABLE)) goto done;
    DWORD status = 0, status_size = sizeof(status);
    if (!WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, WINHTTP_HEADER_NAME_BY_INDEX, &status, &status_size, WINHTTP_NO_HEADER_INDEX) || status != 201) goto done;
    response = malloc(65537);
    if (!response) goto done;
    DWORD used = 0;
    for (;;) {
        ResetEvent(transfer.event);
        if (!completed(&transfer, WinHttpQueryDataAvailable(request, NULL), WINHTTP_CALLBACK_STATUS_DATA_AVAILABLE)) goto done;
        DWORD available = transfer.actual;
        if (!available) break;
        if (available > 65536 - used) goto done;
        ResetEvent(transfer.event);
        if (!completed(&transfer, WinHttpReadData(request, response + used, available, NULL), WINHTTP_CALLBACK_STATUS_READ_COMPLETE) || !transfer.actual) goto done;
        used += transfer.actual;
    }
    response[used] = 0;
    const char *end = NULL;
    parsed = cJSON_ParseWithLengthOpts(response, (size_t)used + 1, &end, true);
    const cJSON *url = cJSON_GetObjectItemCaseSensitive(parsed, "url");
    if (!cJSON_IsObject(parsed) || !cJSON_IsString(url) || !launch_url_valid(&project->editor, url->valuestring)) goto done;
    *address = malloc(strlen(url->valuestring) + 1);
    if (*address) { strcpy(*address, url->valuestring); valid = true; }
 done:
    // HANDLE_CLOSING is the final callback; keep buffers and context alive until then.
    if (request) { WinHttpCloseHandle(request); if (callback_set) WaitForSingleObject(transfer.closed, INFINITE); }
    if (connection) WinHttpCloseHandle(connection);
    if (session) WinHttpCloseHandle(session);
    cJSON_Delete(parsed); free(response); free(host); free(origin);
    if (transfer.event) CloseHandle(transfer.event);
    if (transfer.closed) CloseHandle(transfer.closed);
    return valid;
}

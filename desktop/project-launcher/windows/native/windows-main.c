#include "windows.h"
#include <shellapi.h>
#include <stdlib.h>

static bool open_project(void) {
    bool opened = false;
    wchar_t *file = calloc(PATH_CAPACITY, sizeof(wchar_t)), *installed = calloc(PATH_CAPACITY, sizeof(wchar_t));
    uint8_t *data = NULL;
    Project project = {0};
    if (!file || !installed) goto done;
    DWORD length = GetModuleFileNameW(NULL, file, PATH_CAPACITY), size = 0;
    if (!length || length >= PATH_CAPACITY) goto done;
    data = file_read(file, &size);
    if (!data || !project_parse(data, size, sha256_windows, &project)) goto done;
    const cJSON *development = cJSON_GetObjectItemCaseSensitive(project.config, "development");
    if (development && !cJSON_IsNull(development)) {
        const cJSON *executable = cJSON_GetObjectItemCaseSensitive(development, "executable");
        if (!cJSON_IsObject(development) || !cJSON_IsString(executable)) goto done;
        wchar_t *program = wide_from_utf8(executable->valuestring);
        if (program) opened = application_start(program, development, &project);
        free(program);
    } else if (application_registered_at(L"Software\\5E\\ProjectLauncher", installed)) opened = application_start(installed, NULL, &project);
    else {
        char *address = NULL;
        if (web_transfer(&project, &address)) {
            wchar_t *url = wide_from_utf8(address);
            if (url) opened = (INT_PTR)ShellExecuteW(NULL, L"open", url, NULL, NULL, SW_SHOWNORMAL) > 32;
            free(url); free(address);
        }
    }
 done:
    project_close(&project); free(data); free(file); free(installed);
    return opened;
}

int wWinMain(HINSTANCE instance, HINSTANCE previous, LPWSTR arguments, int show) {
    (void)instance; (void)previous; (void)arguments; (void)show;
    if (open_project()) return 0;
    MessageBoxW(NULL, L"프로젝트를 열지 못했습니다.\n\n원본은 이 파일 안에 보관되어 있습니다.\n인터넷 연결과 5E 앱을 확인한 뒤 다시 열어 주세요.", L"5E 프로젝트 열기", MB_OK | MB_ICONERROR);
    return 1;
}

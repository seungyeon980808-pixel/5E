package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

const registryPath = `Software\5E\ProjectLauncher`

func registeredApplication(location string) (string, error) {
	for _, hive := range []registry.Key{registry.CURRENT_USER, registry.LOCAL_MACHINE} {
		key, err := registry.OpenKey(hive, location, registry.QUERY_VALUE|registry.WOW64_64KEY)
		if errors.Is(err, registry.ErrNotExist) {
			continue
		}
		if err != nil {
			return "", fmt.Errorf("설치 앱 확인: %w", err)
		}
		version, _, versionErr := key.GetIntegerValue("Version")
		executable, _, pathErr := key.GetStringValue("Executable")
		if err := key.Close(); err != nil {
			return "", fmt.Errorf("설치 앱 정보 닫기: %w", err)
		}
		if versionErr != nil || pathErr != nil || version != 1 || !filepath.IsAbs(executable) {
			continue
		}
		stat, err := os.Stat(executable)
		if err == nil && stat.Mode().IsRegular() {
			return executable, nil
		}
	}
	return "", nil
}

func openProject(ctx context.Context) error {
	executable, err := os.Executable()
	if err != nil {
		return fmt.Errorf("프로젝트 파일 위치: %w", err)
	}
	stat, err := os.Stat(executable)
	if err != nil {
		return fmt.Errorf("프로젝트 파일 확인: %w", err)
	}
	if stat.Size() > 64*1024*1024 {
		return errors.New("프로젝트 파일이 너무 큽니다")
	}
	data, err := os.ReadFile(executable)
	if err != nil {
		return fmt.Errorf("프로젝트 읽기: %w", err)
	}
	source, err := parseProject(data)
	if err != nil {
		return fmt.Errorf("프로젝트 열기: %w", err)
	}
	if development := source.config.Development; development != nil {
		return startApplication(development.Executable, development.Args, development.Environment, source.json)
	}
	installed, err := registeredApplication(registryPath)
	if err != nil {
		return fmt.Errorf("설치 앱 찾기: %w", err)
	}
	if installed != "" {
		return startApplication(installed, nil, nil, source.json)
	}
	address, err := transfer(ctx, source)
	if err != nil {
		return fmt.Errorf("웹 앱 열기: %w", err)
	}
	url, err := windows.UTF16PtrFromString(address)
	if err != nil {
		return fmt.Errorf("브라우저 주소: %w", err)
	}
	if err := windows.ShellExecute(0, nil, url, nil, nil, windows.SW_SHOWNORMAL); err != nil {
		return fmt.Errorf("브라우저 실행: %w", err)
	}
	return nil
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 35*time.Second)
	defer cancel()
	if err := openProject(ctx); err != nil {
		message, textErr := windows.UTF16PtrFromString("원본 프로젝트는 이 파일 안에 보관되어 있습니다. 인터넷 연결과 5E 앱을 확인한 뒤 다시 열어 주세요.\n\n" + err.Error())
		caption, captionErr := windows.UTF16PtrFromString("5E 프로젝트를 열지 못했습니다")
		if textErr == nil && captionErr == nil {
			if _, dialogErr := windows.MessageBox(0, message, caption, windows.MB_OK|windows.MB_ICONERROR); dialogErr != nil {
				os.Exit(1)
			}
		}
		os.Exit(1)
	}
}

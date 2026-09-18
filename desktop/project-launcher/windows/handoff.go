package main

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

func startApplication(executable string, args []string, environment map[string]string, source []byte) error {
	if !filepath.IsAbs(executable) {
		return errors.New("설치 앱의 절대 경로가 필요합니다")
	}
	// The receiver deletes this owned copy after reading it; the original executable stays intact.
	root, err := os.MkdirTemp("", "5e-project-open-")
	if err != nil {
		return fmt.Errorf("프로젝트 전달 준비: %w", err)
	}
	document := filepath.Join(root, "document.5e")
	if err := os.WriteFile(document, source, 0o600); err != nil {
		return errors.Join(fmt.Errorf("프로젝트 전달 파일: %w", err), os.RemoveAll(root))
	}
	digest := sha256.Sum256(source)
	receipt := []byte("5E project handoff v1\n" + hex.EncodeToString(digest[:]))
	if err := os.WriteFile(filepath.Join(root, ".5e-handoff"), receipt, 0o600); err != nil {
		return errors.Join(fmt.Errorf("프로젝트 전달 확인 파일: %w", err), os.RemoveAll(root))
	}
	// #nosec G204 -- Use an explicit registered/dev executable, never a shell; os/exec quotes Windows arguments.
	command := exec.Command(executable, append(args, "--project-file="+document)...)
	command.Env = os.Environ()
	for name, value := range environment {
		if name != "FIVE_E_DEV_USER_DATA" && name != "FIVE_E_SMOKE_USER_DATA" && name != "FIVE_E_BUNDLED_PDF_PACK_SOURCE" {
			return errors.Join(errors.New("개발 앱 실행 설정이 올바르지 않습니다"), os.RemoveAll(root))
		}
		command.Env = append(command.Env, name+"="+value)
	}
	if err := command.Start(); err != nil {
		return errors.Join(fmt.Errorf("5E 앱 실행: %w", err), os.RemoveAll(root))
	}
	if err := command.Process.Release(); err != nil {
		return fmt.Errorf("5E 앱 전달 완료: %w", err)
	}
	return nil
}

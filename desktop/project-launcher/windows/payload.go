package main

import (
	"bytes"
	"crypto/sha256"
	"debug/pe"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/url"
)

const (
	footerSize      = 56
	maxProjectBytes = 32 * 1024 * 1024
	payloadMagic    = "5EPRJWIN00000001"
)

type developmentSettings struct {
	Executable  string            `json:"executable"`
	Args        []string          `json:"args"`
	Environment map[string]string `json:"environment"`
}

type settings struct {
	Server       string               `json:"server"`
	EditorOrigin string               `json:"editorOrigin"`
	Development  *developmentSettings `json:"development,omitempty"`
}

type project struct {
	config settings
	json   []byte
}

func parseEndpoint(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("웹 주소 해석: %w", err)
	}
	local := u.Hostname() == "localhost"
	if ip := net.ParseIP(u.Hostname()); ip != nil {
		local = ip.IsLoopback()
	}
	secure := u.Scheme == "https" || u.Scheme == "http" && local
	if u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" ||
		(u.Path != "" && u.Path != "/") || !secure {
		return nil, errors.New("프로젝트 웹 주소가 올바르지 않습니다")
	}
	return u, nil
}

// Authenticode adds an aligned certificate after the project. Find the footer
// before that certificate so signed exports retain the exact editable source.
func payloadEnd(data []byte) (int, error) {
	file, err := pe.NewFile(bytes.NewReader(data))
	if err != nil {
		return 0, fmt.Errorf("프로젝트 Windows 파일 해석: %w", err)
	}
	header, ok := file.OptionalHeader.(*pe.OptionalHeader64)
	if !ok || file.Machine != pe.IMAGE_FILE_MACHINE_AMD64 {
		return 0, errors.New("프로젝트가 Windows x64 실행 파일이 아닙니다")
	}
	end := len(data)
	certificate := header.DataDirectory[pe.IMAGE_DIRECTORY_ENTRY_SECURITY]
	if certificate.VirtualAddress != 0 {
		if uint64(certificate.VirtualAddress)+uint64(certificate.Size) > uint64(len(data)) {
			return 0, errors.New("서명 정보가 손상되었습니다")
		}
		end = int(certificate.VirtualAddress)
	}
	for padding := range 8 {
		at := end - padding - footerSize
		if at >= 0 && string(data[at:at+16]) == payloadMagic {
			return end - padding, nil
		}
		if end-padding-1 < 0 || data[end-padding-1] != 0 {
			break
		}
	}
	return 0, errors.New("프로젝트 데이터가 없거나 파일이 손상되었습니다")
}

func parseProject(data []byte) (project, error) {
	end, err := payloadEnd(data)
	if err != nil {
		return project{}, fmt.Errorf("프로젝트 파일 해석: %w", err)
	}
	footer := data[end-footerSize : end]
	jsonLength := binary.LittleEndian.Uint32(footer[16:20])
	configLength := binary.LittleEndian.Uint32(footer[20:24])
	if jsonLength == 0 || jsonLength > maxProjectBytes || configLength == 0 || configLength > 65536 {
		return project{}, errors.New("프로젝트 크기가 올바르지 않습니다")
	}
	bodyLength := int(jsonLength) + int(configLength)
	if bodyLength > end-footerSize {
		return project{}, errors.New("프로젝트 크기가 파일보다 큽니다")
	}
	start := end - footerSize - bodyLength
	body := data[start : end-footerSize]
	digest := sha256.Sum256(body)
	if !bytes.Equal(digest[:], footer[24:]) {
		return project{}, errors.New("프로젝트 원본이 변경되거나 손상되었습니다")
	}
	var config settings
	if err := json.Unmarshal(body[jsonLength:], &config); err != nil {
		return project{}, fmt.Errorf("프로젝트 실행 설정: %w", err)
	}
	if _, err := parseEndpoint(config.Server); err != nil {
		return project{}, fmt.Errorf("전달 서버: %w", err)
	}
	if _, err := parseEndpoint(config.EditorOrigin); err != nil {
		return project{}, fmt.Errorf("편집기 주소: %w", err)
	}
	original := body[:jsonLength]
	var document struct {
		Pages   []json.RawMessage `json:"pages"`
		Objects []json.RawMessage `json:"objects"`
	}
	if err := json.Unmarshal(original, &document); err != nil {
		return project{}, fmt.Errorf("프로젝트 원본: %w", err)
	}
	if document.Pages == nil && document.Objects == nil {
		return project{}, errors.New("5E 프로젝트 데이터가 아닙니다")
	}
	return project{config: config, json: original}, nil
}

package main

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func transfer(ctx context.Context, source project) (address string, err error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimRight(source.config.Server, "/")+"/api/project-launch", bytes.NewReader(source.json))
	if err != nil {
		return "", fmt.Errorf("웹 전달 준비: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-5E-Request", "1")
	request.Header.Set("Origin", strings.TrimRight(source.config.Server, "/"))
	transport := &http.Transport{Proxy: http.ProxyFromEnvironment, TLSHandshakeTimeout: 10 * time.Second}
	defer transport.CloseIdleConnections()
	client := http.Client{
		Transport: transport, Timeout: 30 * time.Second,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
	}
	response, err := client.Do(request)
	if err != nil {
		return "", fmt.Errorf("웹 전달: %w", err)
	}
	defer func() { err = errors.Join(err, response.Body.Close()) }()
	if response.StatusCode != http.StatusCreated {
		return "", fmt.Errorf("웹 전달 서버 응답: %d", response.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, 65537))
	if err != nil {
		return "", fmt.Errorf("웹 전달 응답 읽기: %w", err)
	}
	if len(data) > 65536 {
		return "", errors.New("웹 전달 응답이 너무 큽니다")
	}
	var reply struct {
		URL string `json:"url"`
	}
	if err := json.Unmarshal(data, &reply); err != nil {
		return "", fmt.Errorf("웹 전달 응답 해석: %w", err)
	}
	editor, err := parseEndpoint(source.config.EditorOrigin)
	if err != nil {
		return "", fmt.Errorf("편집기 설정: %w", err)
	}
	target, err := url.Parse(reply.URL)
	if err != nil {
		return "", fmt.Errorf("편집기 응답: %w", err)
	}
	id := strings.TrimPrefix(target.Fragment, "project=")
	if target.Scheme != editor.Scheme || !strings.EqualFold(target.Host, editor.Host) || target.User != nil ||
		!strings.HasPrefix(target.Fragment, "project=") || len(id) != 48 {
		return "", errors.New("편집기 응답 주소가 올바르지 않습니다")
	}
	if _, err := hex.DecodeString(id); err != nil {
		return "", fmt.Errorf("편집기 열기 요청: %w", err)
	}
	return target.String(), nil
}

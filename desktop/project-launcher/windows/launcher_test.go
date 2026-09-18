package main

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func exportedProject(t *testing.T) []byte {
	t.Helper()
	script := `const {createWindowsProjectPackage}=require('../../windows-project-package.cjs');
const fs=require('node:fs/promises');(async()=>{const p=await createWindowsProjectPackage({json:'{"pages":[{"id":"한국어","objects":[]}]}',server:'http://127.0.0.1:19624'});try{process.stdout.write((await fs.readFile(p.bundle)).toString('base64'));}finally{await p.close();}})().catch(e=>{console.error(e);process.exitCode=1;});`
	output, err := exec.Command("node", "-e", script).Output()
	require.NoError(t, err)
	data, err := base64.StdEncoding.DecodeString(string(output))
	require.NoError(t, err)
	return data
}

func Test_Project_preserves_original_when_exported_by_product(t *testing.T) {
	// Given an executable produced by the actual JavaScript save implementation.
	data := exportedProject(t)
	// When the native launcher reads its payload.
	source, err := parseProject(data)
	// Then both languages agree on exact UTF-8 source and settings.
	require.NoError(t, err)
	require.JSONEq(t, `{"pages":[{"id":"한국어","objects":[]}]}`, string(source.json))
	require.Equal(t, "http://127.0.0.1:19624", source.config.Server)
}

func Test_Project_rejects_source_when_changed(t *testing.T) {
	// Given a product executable with a damaged payload.
	data := exportedProject(t)
	data[len(data)-footerSize-1] ^= 1
	// When the native launcher reads it.
	_, err := parseProject(data)
	// Then it reports damage instead of opening different data.
	require.Error(t, err)
}

func Test_Project_finds_payload_when_certificate_is_appended(t *testing.T) {
	// Given the alignment and certificate table layout used by Authenticode.
	data := exportedProject(t)
	padding := (8 - len(data)%8) % 8
	certificateOffset := uint64(len(data)) + uint64(padding)
	if certificateOffset > math.MaxUint32 {
		t.Fatal("certificate offset exceeds PE format")
		return
	}
	data = append(data, make([]byte, padding+8)...)
	peOffset := int(binary.LittleEndian.Uint32(data[60:64]))
	binary.LittleEndian.PutUint32(data[peOffset+168:peOffset+172], uint32(certificateOffset))
	binary.LittleEndian.PutUint32(data[peOffset+172:peOffset+176], 8)
	// When the launcher locates the source before that table.
	source, err := parseProject(data)
	// Then signing layout does not discard the editable source.
	require.NoError(t, err)
	require.Contains(t, string(source.json), "한국어")
}

func Test_Transfer_preserves_bytes_when_no_app_is_installed(t *testing.T) {
	// Given a real HTTP server accepting original project data.
	received := make(chan []byte, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/api/project-launch", r.URL.Path)
		assert.Empty(t, r.Header.Get("Cookie"))
		assert.Empty(t, r.Header.Get("Authorization"))
		assert.Equal(t, "1", r.Header.Get("X-5E-Request"))
		assert.Equal(t, "http://"+r.Host, r.Header.Get("Origin"))
		var body bytes.Buffer
		_, err := body.ReadFrom(r.Body)
		assert.NoError(t, err)
		received <- body.Bytes()
		w.WriteHeader(http.StatusCreated)
		err = json.NewEncoder(w).Encode(struct {
			URL string `json:"url"`
		}{"http://" + r.Host + "/editor/#project=" + strings.Repeat("a", 48)})
		assert.NoError(t, err)
	}))
	t.Cleanup(server.Close)
	source := project{config: settings{Server: server.URL, EditorOrigin: server.URL}, json: []byte(`{"pages":[{"id":"한국어","objects":[]}]}`)}
	// When the native transfer performs the request.
	address, err := transfer(t.Context(), source)
	// Then the original is delivered without authentication or sharing state.
	require.NoError(t, err)
	require.Equal(t, source.json, <-received)
	require.Equal(t, server.URL+"/editor/#project="+strings.Repeat("a", 48), address)
}

func Test_Transfer_rejects_redirect_when_server_moves(t *testing.T) {
	// Given a transfer endpoint that redirects elsewhere.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "https://example.invalid/", http.StatusTemporaryRedirect)
	}))
	t.Cleanup(server.Close)
	// When the launcher attempts the transfer.
	_, err := transfer(t.Context(), project{config: settings{Server: server.URL, EditorOrigin: server.URL}, json: []byte(`{"pages":[]}`)})
	// Then it stops before forwarding original data to another destination.
	require.Error(t, err)
}

func Test_Transfer_rejects_editor_when_origin_changes(t *testing.T) {
	// Given a server returning an editor on a different origin.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusCreated)
		_, err := w.Write([]byte(`{"url":"https://example.invalid/#project=` + strings.Repeat("a", 48) + `"}`))
		assert.NoError(t, err)
	}))
	t.Cleanup(server.Close)
	// When the launcher attempts the transfer.
	_, err := transfer(t.Context(), project{config: settings{Server: server.URL, EditorOrigin: server.URL}, json: []byte(`{"pages":[]}`)})
	// Then it refuses to open the unconfigured website.
	require.Error(t, err)
}

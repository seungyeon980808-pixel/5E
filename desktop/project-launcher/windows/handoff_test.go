package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func Test_Handoff_preserves_source_when_receiver_reads_file_argument(t *testing.T) {
	// Given a real child process receiving a project through os/exec.
	executable, err := exec.LookPath("node")
	require.NoError(t, err)
	received := make(chan []byte, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		assert.NoError(t, err)
		received <- body
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(server.Close)
	module, err := filepath.Abs(filepath.Join("..", "..", "project-open.cjs"))
	require.NoError(t, err)
	script := `const fs=require('node:fs');const a=process.argv.find(a=>a.startsWith('--project-file='));const p=a.slice(15),body=fs.readFileSync(p);process.argv=process.argv.filter(a=>!a.startsWith('--project-file='));const {EventEmitter}=require('node:events');const receiver=require(` + strconv.Quote(module) + `).createProjectOpen({app:new EventEmitter(),ipcMain:new EventEmitter(),getWindow:()=>null});receiver.receive(p).then(()=>{if(fs.existsSync(p)||fs.existsSync(require('node:path').dirname(p)))throw Error('handoff copy was not cleaned');return fetch(` + strconv.Quote(server.URL) + `,{method:'POST',body});}).catch(()=>process.exit(1));`
	source := []byte(`{"pages":[{"id":"한글","objects":[]}]}`)
	// When the native launcher hands off the document.
	err = startApplication(executable, []string{"-e", script, "--"}, nil, source)
	// Then the child can read the exact original bytes using a quoted file argument.
	require.NoError(t, err)
	select {
	case actual := <-received:
		require.Equal(t, source, actual)
	case <-t.Context().Done():
		t.Fatal("receiver did not receive the project")
	}
}

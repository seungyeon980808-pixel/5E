package main

import (
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
	"golang.org/x/sys/windows/registry"
)

func Test_Registry_finds_supported_application_when_registered(t *testing.T) {
	// Given an isolated registration in the same 64-bit registry view as NSIS.
	location := `Software\5E\LauncherQA\` + filepath.Base(t.TempDir())
	key, _, err := registry.CreateKey(registry.CURRENT_USER, location, registry.ALL_ACCESS|registry.WOW64_64KEY)
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, registry.DeleteKey(registry.CURRENT_USER, location)) })
	executable, err := exec.LookPath("node")
	require.NoError(t, err)
	require.NoError(t, key.SetStringValue("Executable", executable))
	require.NoError(t, key.SetDWordValue("Version", 1))
	require.NoError(t, key.Close())
	// When the launcher checks installation metadata.
	actual, err := registeredApplication(location)
	// Then it selects the registered receiver without touching the user's 5E key.
	require.NoError(t, err)
	require.Equal(t, executable, actual)
}

func Test_Registry_uses_web_path_when_no_supported_application_exists(t *testing.T) {
	// Given a registration that does not exist.
	location := `Software\5E\LauncherQA\` + filepath.Base(t.TempDir())
	// When the launcher checks that location.
	actual, err := registeredApplication(location)
	// Then the installed-app branch is absent.
	require.NoError(t, err)
	require.Empty(t, actual)
}

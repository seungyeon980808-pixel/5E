const {contextBridge,ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('fiveEExam', {
  annotations:request=>ipcRenderer.invoke('exam:annotations',request),
  onProjectOpen:callback=>{const listener=(_event,payload)=>callback(payload);ipcRenderer.on('exam:project-open',listener);return()=>ipcRenderer.removeListener('exam:project-open',listener);},
  projectSnapshotReply:payload=>ipcRenderer.invoke('exam:project-snapshot-reply',payload),
  onProjectSnapshot:callback=>{const listener=(_event,payload)=>callback(payload);ipcRenderer.on('exam:project-snapshot',listener);return()=>ipcRenderer.removeListener('exam:project-snapshot',listener);},
  snapshot:request=>ipcRenderer.invoke('exam:workspace-snapshot',request),
  restoreWorkspace:payload=>ipcRenderer.invoke('exam:workspace-restore',payload),
  onWorkspaceChanged:callback=>{const listener=()=>callback();ipcRenderer.on('exam:workspace-changed',listener);return()=>ipcRenderer.removeListener('exam:workspace-changed',listener);},
  onSaveWorkspace:callback=>{const listener=()=>callback();ipcRenderer.on('exam:save-workspace',listener);return()=>ipcRenderer.removeListener('exam:save-workspace',listener);},
  getNames:() => ipcRenderer.invoke('exam:get-names'),
  onNames:callback => {const listener = (_event,names) => callback(names);ipcRenderer.on('exam:names',listener);return () => ipcRenderer.removeListener('exam:names',listener);},
  requestEdit:payload => ipcRenderer.invoke('exam:request-edit',payload),
  ack:payload => ipcRenderer.invoke('exam:ack',payload),
  returnToSource:() => ipcRenderer.invoke('exam:return-source'),
  onResult:callback => {
    const listener = (_event,payload) => callback(payload);
    ipcRenderer.on('exam:result',listener);
    return () => ipcRenderer.removeListener('exam:result',listener);
  },
});

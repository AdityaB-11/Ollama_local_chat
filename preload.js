const { contextBridge, ipcRenderer } = require('electron');

// Expose IPC functions to the renderer process
contextBridge.exposeInMainWorld('chatAPI', {
  // Chat history management
  getChatHistory: () => ipcRenderer.invoke('get-chat-history'),
  saveChat: (conversation) => ipcRenderer.invoke('save-chat', conversation),
  updateChat: (data) => ipcRenderer.invoke('update-chat', data),
  deleteChat: (id) => ipcRenderer.invoke('delete-chat', id),
  
  // Ollama model interaction
  generateResponse: (data) => ipcRenderer.invoke('generate-response', data),
  getAvailableModels: () => ipcRenderer.invoke('get-available-models'),
  getModelName: () => ipcRenderer.invoke('get-model-name'),
  setModelName: (modelName) => ipcRenderer.invoke('set-model-name', modelName)
}); 
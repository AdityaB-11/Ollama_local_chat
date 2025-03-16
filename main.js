const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');
const fs = require('fs');
const fetch = require('node-fetch');

// Initialize the storage for chat history and settings
const store = new Store({
  name: 'chat-history',
  defaults: {
    conversations: [],
    modelName: 'deepseek' // Store the model name instead of path
  }
});

let mainWindow;

// Check if Ollama is running
async function checkOllamaAvailability() {
  try {
    // Try multiple localhost variants
    const urls = [
      'http://127.0.0.1:11434/api/tags',
      'http://localhost:11434/api/tags',
      'http://[::1]:11434/api/tags'
    ];

    for (const url of urls) {
      try {
        const response = await fetch(url, {
          timeout: 5000 // 5 second timeout
        });
        if (response.ok) {
          console.log('Successfully connected to Ollama at:', url);
          return true;
        }
      } catch (e) {
        console.log(`Failed to connect to ${url}:`, e.message);
        continue;
      }
    }
    
    throw new Error('Could not connect to Ollama on any available address');
  } catch (error) {
    console.error('Ollama connection error:', error);
    return false;
  }
}

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Load the index.html file
  mainWindow.loadFile('index.html');

  // Check Ollama availability when the window is ready
  mainWindow.webContents.on('did-finish-load', async () => {
    const isOllamaAvailable = await checkOllamaAvailability();
    if (!isOllamaAvailable) {
      console.log('Ollama not available, showing warning dialog...');
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Ollama Not Available',
        message: 'Could not connect to Ollama. Please ensure:\n\n1. Ollama is installed (download from ollama.ai)\n2. Ollama service is running\n3. Open a new terminal and run: ollama serve\n4. No firewall is blocking port 11434\n\nThe app will continue to retry connecting in the background.',
        buttons: ['OK']
      });
      
      // Start periodic connection check
      setInterval(async () => {
        const available = await checkOllamaAvailability();
        if (available) {
          console.log('Ollama connection established');
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Ollama Connected',
            message: 'Successfully connected to Ollama service.',
            buttons: ['OK']
          });
        }
      }, 10000); // Check every 10 seconds
    } else {
      console.log('Ollama is available');
    }
  });

  // Only open DevTools in development mode if --dev flag is passed
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

// Create window when Electron is ready
app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handlers for chat functionality
ipcMain.handle('get-chat-history', async () => {
  return store.get('conversations');
});

ipcMain.handle('save-chat', async (event, conversation) => {
  const conversations = store.get('conversations');
  conversations.push(conversation);
  store.set('conversations', conversations);
  return true;
});

ipcMain.handle('update-chat', async (event, { id, messages }) => {
  const conversations = store.get('conversations');
  const index = conversations.findIndex(conv => conv.id === id);
  if (index !== -1) {
    conversations[index].messages = messages;
    store.set('conversations', conversations);
    return true;
  }
  return false;
});

ipcMain.handle('delete-chat', async (event, id) => {
  const conversations = store.get('conversations');
  const newConversations = conversations.filter(conv => conv.id !== id);
  store.set('conversations', newConversations);
  return true;
});

// Helper function to make API calls with fallback URLs
async function makeOllamaRequest(endpoint, options = {}) {
  const baseUrls = [
    'http://127.0.0.1:11434',
    'http://localhost:11434',
    'http://[::1]:11434'
  ];

  let lastError = null;
  for (const baseUrl of baseUrls) {
    try {
      const url = `${baseUrl}${endpoint}`;
      console.log(`Attempting request to ${url}`);
      
      const response = await fetch(url, {
        ...options,
        timeout: 10000 // Increase timeout to 10 seconds
      });
      
      if (response.ok) {
        console.log(`Successful response from ${url}`);
        return response;
      } else {
        console.log(`Non-OK response from ${url}:`, response.status);
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (e) {
      console.log(`Error connecting to ${baseUrl}:`, e.message);
      lastError = e;
    }
  }
  
  // If we get here, all attempts failed
  throw new Error(`Failed to connect to Ollama: ${lastError?.message || 'Unknown error'}`);
}

// Get available Ollama models
ipcMain.handle('get-available-models', async () => {
  try {
    const response = await makeOllamaRequest('/api/tags');
    const data = await response.json();
    return { success: true, models: data.models };
  } catch (error) {
    console.error('Error fetching models:', error);
    return { 
      success: false, 
      error: 'Could not connect to Ollama. Please make sure Ollama is running and accessible.',
      models: []
    };
  }
});

// Get the current model name
ipcMain.handle('get-model-name', async () => {
  return store.get('modelName');
});

// Set the model name
ipcMain.handle('set-model-name', async (event, modelName) => {
  store.set('modelName', modelName);
  return { success: true };
});

// Helper function to check if a model exists
async function checkModelExists(modelName) {
  try {
    const response = await makeOllamaRequest('/api/tags');
    const data = await response.json();
    return data.models && data.models.some(model => model.name === modelName);
  } catch (error) {
    console.error('Error checking model existence:', error);
    return false;
  }
}

// Helper function to pull a model
async function pullModel(modelName) {
  try {
    console.log(`Pulling model ${modelName}...`);
    const response = await makeOllamaRequest('/api/pull', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: modelName
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to pull model: ${response.statusText}`);
    }
    
    console.log(`Successfully pulled model ${modelName}`);
    return true;
  } catch (error) {
    console.error('Error pulling model:', error);
    return false;
  }
}

// This will be our handler for the Ollama model interactions
ipcMain.handle('generate-response', async (event, { prompt, conversationHistory }) => {
  try {
    const modelName = store.get('modelName');
    
    // First check if Ollama is running
    const isAvailable = await checkOllamaAvailability();
    if (!isAvailable) {
      throw new Error('Ollama service is not running. Please start Ollama by running "ollama serve" in a terminal.');
    }
    
    // Check if model exists
    const modelExists = await checkModelExists(modelName);
    if (!modelExists) {
      console.log(`Model ${modelName} not found, attempting to pull it...`);
      const pulled = await pullModel(modelName);
      if (!pulled) {
        throw new Error(`Could not pull model ${modelName}. Please make sure you have an internet connection and try again.`);
      }
      
      // Double check that the model is now available
      const modelAvailable = await checkModelExists(modelName);
      if (!modelAvailable) {
        throw new Error(`Model ${modelName} could not be loaded after pulling. Please try selecting a different model.`);
      }
    }
    
    // Format conversation history for context
    let messages = [];
    if (conversationHistory && conversationHistory.length > 0) {
      messages = conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
    }
    
    // Add the current prompt
    messages.push({
      role: 'user',
      content: prompt
    });

    console.log(`Generating response with model ${modelName}...`);
    
    try {
      // Call Ollama API
      const response = await makeOllamaRequest('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelName,
          messages: messages,
          stream: false,
          options: {
            temperature: 0.7,
            top_p: 0.95
          }
        })
      });

      const data = await response.json();
      console.log('Response generated successfully');
      
      if (!data.message || !data.message.content) {
        throw new Error('Invalid response format from Ollama');
      }
      
      return { 
        success: true, 
        response: data.message.content 
      };
    } catch (chatError) {
      console.error('Chat API error:', chatError);
      throw new Error(`Failed to generate response: ${chatError.message}`);
    }
  } catch (error) {
    console.error('Error in generate-response:', error);
    let errorMessage = "An error occurred while generating the response.\n\n";
    
    if (error.message.includes('not running')) {
      errorMessage += "Ollama is not running. Please:\n" +
        "1. Open a new terminal\n" +
        "2. Run the command: ollama serve\n" +
        "3. Keep that terminal open\n" +
        "4. Try sending your message again";
    } else if (error.message.includes('Could not pull model')) {
      errorMessage += error.message + "\n\n" +
        "Please try:\n" +
        "1. Checking your internet connection\n" +
        "2. Selecting a different model\n" +
        "3. Running 'ollama pull " + modelName + "' in a terminal";
    } else if (error.message.includes('ECONNREFUSED') || error.message.includes('Failed to connect')) {
      errorMessage += "Could not connect to Ollama. Please ensure that:\n" +
        "1. Ollama is running (open a new terminal and run: ollama serve)\n" +
        "2. No firewall is blocking port 11434\n" +
        "3. Try restarting the Ollama service";
    } else {
      errorMessage += error.message + "\n\n" +
        "Please try:\n" +
        "1. Refreshing the available models\n" +
        "2. Selecting a different model\n" +
        "3. Restarting the application";
    }
    
    return { 
      success: false, 
      error: error.message,
      response: errorMessage
    };
  }
});

// This will be our handler for streaming responses
ipcMain.handle('generate-streaming-response', async (event, { prompt, conversationHistory, channel }) => {
  try {
    const modelName = store.get('modelName');
    
    // First check if Ollama is running
    const isAvailable = await checkOllamaAvailability();
    if (!isAvailable) {
      event.sender.send(channel, {
        type: 'error',
        error: 'Ollama service is not running. Please start Ollama by running "ollama serve" in a terminal.'
      });
      throw new Error('Ollama service is not running. Please start Ollama by running "ollama serve" in a terminal.');
    }
    
    // Check if model exists
    const modelExists = await checkModelExists(modelName);
    if (!modelExists) {
      console.log(`Model ${modelName} not found, attempting to pull it...`);
      const pulled = await pullModel(modelName);
      if (!pulled) {
        const error = `Could not pull model ${modelName}. Please make sure you have an internet connection and try again.`;
        event.sender.send(channel, { type: 'error', error });
        throw new Error(error);
      }
      
      // Double check that the model is now available
      const modelAvailable = await checkModelExists(modelName);
      if (!modelAvailable) {
        const error = `Model ${modelName} could not be loaded after pulling. Please try selecting a different model.`;
        event.sender.send(channel, { type: 'error', error });
        throw new Error(error);
      }
    }
    
    // Format conversation history for context
    let messages = [];
    if (conversationHistory && conversationHistory.length > 0) {
      messages = conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
    }
    
    // Add the current prompt
    messages.push({
      role: 'user',
      content: prompt
    });

    console.log(`Generating streaming response with model ${modelName}...`);
    
    try {
      // Call Ollama API with streaming enabled
      const response = await makeOllamaRequest('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelName,
          messages: messages,
          stream: true,
          options: {
            temperature: 0.7,
            top_p: 0.95
          }
        })
      });

      if (!response.ok) {
        const error = `HTTP error! status: ${response.status}`;
        event.sender.send(channel, { type: 'error', error });
        throw new Error(error);
      }

      let fullResponse = '';
      
      // Process the stream using node-fetch's body.on('data')
      response.body.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        
        for (const line of lines) {
          if (line.trim() === '') continue;
          
          try {
            const data = JSON.parse(line);
            
            // Check for error in the response
            if (data.error) {
              event.sender.send(channel, { type: 'error', error: data.error });
              throw new Error(data.error);
            }
            
            if (data.message?.content) {
              event.sender.send(channel, {
                type: 'content',
                content: data.message.content
              });
              fullResponse += data.message.content;
            }
          } catch (parseError) {
            console.error('Error parsing streaming response line:', parseError);
            console.error('Problematic line:', line);
            // Don't throw here, try to continue processing other lines
          }
        }
      });

      // Handle end of stream
      await new Promise((resolve, reject) => {
        response.body.on('end', () => {
          event.sender.send(channel, { type: 'done' });
          resolve();
        });
        
        response.body.on('error', (error) => {
          console.error('Stream error:', error);
          event.sender.send(channel, { type: 'error', error: error.message });
          reject(error);
        });
      });
      
      return { success: true, response: fullResponse };
      
    } catch (chatError) {
      console.error('Chat API error:', chatError);
      event.sender.send(channel, {
        type: 'error',
        error: chatError.message
      });
      throw chatError;
    }
  } catch (error) {
    console.error('Error in generate-streaming-response:', error);
    let errorMessage = "An error occurred while generating the response.\n\n";
    
    if (error.message.includes('not running')) {
      errorMessage += "Ollama is not running. Please:\n" +
        "1. Open a new terminal\n" +
        "2. Run the command: ollama serve\n" +
        "3. Keep that terminal open\n" +
        "4. Try sending your message again";
    } else if (error.message.includes('Could not pull model')) {
      errorMessage += error.message + "\n\n" +
        "Please try:\n" +
        "1. Checking your internet connection\n" +
        "2. Selecting a different model\n" +
        "3. Running 'ollama pull " + modelName + "' in a terminal";
    } else if (error.message.includes('ECONNREFUSED') || error.message.includes('Failed to connect')) {
      errorMessage += "Could not connect to Ollama. Please ensure that:\n" +
        "1. Ollama is running (open a new terminal and run: ollama serve)\n" +
        "2. No firewall is blocking port 11434\n" +
        "3. Try restarting the Ollama service";
    } else {
      errorMessage += error.message + "\n\n" +
        "Please try:\n" +
        "1. Refreshing the available models\n" +
        "2. Selecting a different model\n" +
        "3. Restarting the application";
    }
    
    event.sender.send(channel, {
      type: 'error',
      error: errorMessage
    });
    
    return { 
      success: false, 
      error: error.message,
      response: errorMessage
    };
  }
}); 
// DOM Elements
const conversationsList = document.getElementById('conversations-list');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const newChatBtn = document.getElementById('new-chat-btn');
const currentChatTitle = document.getElementById('current-chat-title');
const thinkBtn = document.getElementById('think-btn');

// Settings elements
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeModalBtn = document.querySelector('.close-modal');
const modelSelect = document.getElementById('model-select');
const refreshModelsBtn = document.getElementById('refresh-models-btn');
const modelStatus = document.getElementById('model-status');
const saveSettingsBtn = document.getElementById('save-settings-btn');

// Application state
let conversations = [];
let currentConversation = null;
let isGenerating = false;
let currentModelName = '';
let isThinkingMode = false;

// Initialize the application
async function initializeApp() {
  console.log('Starting application initialization...');
  
  try {
    // Load conversation history
    try {
      console.log('Loading chat history...');
      conversations = await window.chatAPI.getChatHistory();
      console.log('Chat history loaded successfully:', conversations.length, 'conversations');
    } catch (historyError) {
      console.error('Failed to load chat history:', historyError);
      conversations = [];
    }
    
    try {
      console.log('Rendering conversations list...');
      renderConversationsList();
      console.log('Conversations list rendered');
    } catch (renderError) {
      console.error('Failed to render conversations list:', renderError);
    }
    
    // Get the current model name and available models
    try {
      console.log('Getting current model name...');
      currentModelName = await window.chatAPI.getModelName();
      console.log('Current model name:', currentModelName);
    } catch (modelNameError) {
      console.error('Failed to get model name:', modelNameError);
      currentModelName = 'deepseek'; // Default model
      console.log('Using default model:', currentModelName);
    }
    
    try {
      console.log('Loading available models...');
      const modelsResult = await loadAvailableModels();
      console.log('Models loading result:', modelsResult);
    } catch (modelsError) {
      console.error('Failed to load models:', modelsError);
      throw new Error('Could not load available models: ' + modelsError.message);
    }
    
    // Create a new conversation if none exists
    try {
      if (conversations.length === 0) {
        console.log('No existing conversations, creating new one...');
        createNewConversation();
        console.log('New conversation created');
      } else {
        console.log('Loading most recent conversation...');
        loadConversation(conversations[conversations.length - 1].id);
        console.log('Recent conversation loaded');
      }
    } catch (conversationError) {
      console.error('Failed to handle conversations:', conversationError);
      throw new Error('Could not initialize conversations: ' + conversationError.message);
    }
    
    console.log('Application initialization completed successfully');
  } catch (error) {
    console.error('Application initialization failed:', error);
    showErrorMessage(`Failed to initialize the application: ${error.message}\n\nPlease ensure:\n1. Ollama is installed\n2. Run 'ollama serve' in a new terminal\n3. Check the console (Ctrl+Shift+I) for detailed errors`);
    throw error;
  }
}

// Load available models
async function loadAvailableModels() {
  console.log('Starting to load available models...');
  try {
    refreshModelsBtn.classList.add('loading');
    modelStatus.textContent = 'Loading available models...';
    modelStatus.className = 'model-status';
    
    console.log('Fetching models from Ollama...');
    const result = await window.chatAPI.getAvailableModels();
    console.log('Received models result:', result);
    
    if (result.success) {
      // Clear existing options
      modelSelect.innerHTML = '';
      
      if (!result.models || result.models.length === 0) {
        modelStatus.textContent = 'No models found. Please pull a model first.';
        modelStatus.className = 'model-status warning';
        
        // Add a default option
        const option = document.createElement('option');
        option.value = 'deepseek';
        option.textContent = 'deepseek (will be downloaded)';
        modelSelect.appendChild(option);
        console.log('No models found, added default option');
        return result;
      }
      
      // Add options for each model
      result.models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.name;
        option.textContent = model.name;
        modelSelect.appendChild(option);
        console.log('Added model option:', model.name);
      });
      
      // Set the current model
      if (currentModelName) {
        if (result.models.some(m => m.name === currentModelName)) {
          modelSelect.value = currentModelName;
          console.log('Set current model to:', currentModelName);
        } else {
          console.log('Current model not found in available models');
          modelStatus.textContent = `Model "${currentModelName}" not found. It will be downloaded when used.`;
          modelStatus.className = 'model-status warning';
        }
      }
      
      modelStatus.textContent = `${result.models.length} models available`;
      modelStatus.className = 'model-status success';
      return result;
    } else {
      throw new Error(result.error || 'Failed to load models');
    }
  } catch (error) {
    console.error('Error in loadAvailableModels:', error);
    modelStatus.textContent = 'Error: Make sure Ollama is running';
    modelStatus.className = 'model-status error';
    throw error;
  } finally {
    refreshModelsBtn.classList.remove('loading');
  }
}

// Create a new conversation
function createNewConversation() {
  const newConversation = {
    id: generateId(),
    title: 'New Conversation',
    createdAt: new Date().toISOString(),
    messages: []
  };
  
  currentConversation = newConversation;
  conversations.push(newConversation);
  
  // Save to storage
  window.chatAPI.saveChat(newConversation);
  
  // Update UI
  renderConversationsList();
  renderMessages();
  currentChatTitle.textContent = newConversation.title;
}

// Load a conversation
function loadConversation(id) {
  currentConversation = conversations.find(conv => conv.id === id);
  
  if (currentConversation) {
    renderMessages();
    currentChatTitle.textContent = currentConversation.title;
    
    // Highlight the active conversation in the sidebar
    const items = conversationsList.querySelectorAll('.conversation-item');
    items.forEach(item => {
      if (item.dataset.id === id) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }
}

// Delete a conversation
async function deleteConversation(id) {
  try {
    await window.chatAPI.deleteChat(id);
    conversations = conversations.filter(conv => conv.id !== id);
    
    // If the current conversation was deleted, load another one or create a new one
    if (currentConversation && currentConversation.id === id) {
      if (conversations.length > 0) {
        loadConversation(conversations[conversations.length - 1].id);
      } else {
        createNewConversation();
      }
    }
    
    renderConversationsList();
  } catch (error) {
    console.error('Error deleting conversation:', error);
    showErrorMessage('Failed to delete the conversation.');
  }
}

// Render the conversations list in the sidebar
function renderConversationsList() {
  conversationsList.innerHTML = '';
  
  conversations.forEach(conv => {
    const item = document.createElement('div');
    item.className = 'conversation-item';
    item.dataset.id = conv.id;
    if (currentConversation && conv.id === currentConversation.id) {
      item.classList.add('active');
    }
    
    // Get the first few characters of the first message or use the title
    let title = conv.title;
    if (conv.messages.length > 0 && conv.messages[0].content) {
      title = conv.messages[0].content.substring(0, 30) + (conv.messages[0].content.length > 30 ? '...' : '');
    }
    
    item.innerHTML = `
      <span>${title}</span>
      <button class="delete-chat-btn" data-id="${conv.id}">×</button>
    `;
    
    // Add event listeners
    item.addEventListener('click', (e) => {
      if (!e.target.classList.contains('delete-chat-btn')) {
        loadConversation(conv.id);
      }
    });
    
    conversationsList.appendChild(item);
  });
  
  // Add event listeners for delete buttons
  const deleteButtons = document.querySelectorAll('.delete-chat-btn');
  deleteButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      deleteConversation(id);
    });
  });
}

// Render messages in the chat container
function renderMessages() {
  messagesContainer.innerHTML = '';
  
  if (!currentConversation) return;
  
  currentConversation.messages.forEach(message => {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${message.role === 'user' ? 'user-message' : 'assistant-message'}`;
    
    messageElement.innerHTML = `
      <div class="message-content">${message.content}</div>
    `;
    
    messagesContainer.appendChild(messageElement);
  });
  
  // Scroll to the bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Send a message
async function sendMessage() {
  const message = messageInput.value.trim();
  
  if (!message || isGenerating) return;
  
  try {
    isGenerating = true;
    sendBtn.disabled = true;
    
    // Add user message to the conversation
    const userMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    };
    
    currentConversation.messages.push(userMessage);
    
    // Update the conversation title if it's the first message
    if (currentConversation.messages.length === 1) {
      currentConversation.title = message.substring(0, 30) + (message.length > 30 ? '...' : '');
      currentChatTitle.textContent = currentConversation.title;
    }
    
    // Clear input and render messages
    messageInput.value = '';
    renderMessages();
    renderConversationsList();
    
    // Create a new message element for the assistant's response
    const assistantMessageElement = document.createElement('div');
    assistantMessageElement.className = 'message assistant-message';
    const contentElement = document.createElement('div');
    contentElement.className = 'message-content';
    assistantMessageElement.appendChild(contentElement);
    messagesContainer.appendChild(assistantMessageElement);
    
    // Show loading indicator
    contentElement.textContent = 'Generating response...';
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Update the conversation in storage
    await window.chatAPI.updateChat({
      id: currentConversation.id,
      messages: currentConversation.messages
    });
    
    // If thinking mode is on, add system message to think step by step
    let prompt = message;
    if (isThinkingMode) {
      prompt = "Let's approach this step by step:\n\n" + message;
    }
    
    try {
      // Generate response
      const response = await window.chatAPI.generateResponse({
        prompt: prompt,
        conversationHistory: currentConversation.messages.slice(0, -1) // Exclude the current message
      });
      
      if (response.success) {
        // Update the message content
        contentElement.textContent = response.response;
        
        // Add assistant message to the conversation
        const assistantMessage = {
          role: 'assistant',
          content: response.response,
          timestamp: new Date().toISOString()
        };
        
        currentConversation.messages.push(assistantMessage);
        
        // Update the conversation in storage
        await window.chatAPI.updateChat({
          id: currentConversation.id,
          messages: currentConversation.messages
        });
      } else {
        contentElement.textContent = response.response;
        contentElement.classList.add('error');
        console.error('Response error:', response.error);
      }
    } catch (error) {
      console.error('Error generating response:', error);
      contentElement.textContent = 'Error: Failed to generate response. Please try again.';
      contentElement.classList.add('error');
      assistantMessageElement.remove();
    }
  } catch (error) {
    console.error('Error sending message:', error);
    showErrorMessage('Failed to send message. Please try again.');
  } finally {
    isGenerating = false;
    sendBtn.disabled = false;
  }
}

// Show loading indicator
function showLoadingIndicator() {
  const loadingElement = document.createElement('div');
  loadingElement.className = 'loading-indicator';
  loadingElement.innerHTML = `
    <span>Generating response</span>
    <div class="loading-dots">
      <div class="dot"></div>
      <div class="dot"></div>
      <div class="dot"></div>
    </div>
  `;
  
  messagesContainer.appendChild(loadingElement);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Remove loading indicator
function removeLoadingIndicator() {
  const loadingIndicator = document.querySelector('.loading-indicator');
  if (loadingIndicator) {
    loadingIndicator.remove();
  }
}

// Show error message
function showErrorMessage(message) {
  const errorElement = document.createElement('div');
  errorElement.className = 'message assistant-message';
  errorElement.innerHTML = `
    <div class="message-content error">Error: ${message}</div>
  `;
  
  messagesContainer.appendChild(errorElement);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Generate a unique ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// Open settings modal
function openSettingsModal() {
  settingsModal.style.display = 'block';
  loadAvailableModels();
}

// Close settings modal
function closeSettingsModal() {
  settingsModal.style.display = 'none';
}

// Save settings
async function saveSettings() {
  try {
    const selectedModel = modelSelect.value;
    if (selectedModel !== currentModelName) {
      await window.chatAPI.setModelName(selectedModel);
      currentModelName = selectedModel;
      modelStatus.textContent = `Model changed to ${selectedModel}`;
      modelStatus.className = 'model-status success';
    }
    closeSettingsModal();
  } catch (error) {
    console.error('Error saving settings:', error);
    modelStatus.textContent = 'Error: Failed to save settings';
    modelStatus.className = 'model-status error';
  }
}

// Toggle thinking mode
function toggleThinkingMode() {
  isThinkingMode = !isThinkingMode;
  thinkBtn.classList.toggle('active', isThinkingMode);
  
  // Update placeholder text based on mode
  messageInput.placeholder = isThinkingMode 
    ? "I'll help you think through this step by step..." 
    : "Type your message here...";
}

// Event Listeners
sendBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

newChatBtn.addEventListener('click', createNewConversation);

// Settings event listeners
settingsBtn.addEventListener('click', openSettingsModal);
closeModalBtn.addEventListener('click', closeSettingsModal);
refreshModelsBtn.addEventListener('click', loadAvailableModels);
saveSettingsBtn.addEventListener('click', saveSettings);

// Close modal when clicking outside of it
window.addEventListener('click', (e) => {
  if (e.target === settingsModal) {
    closeSettingsModal();
  }
});

// Add think button event listener
thinkBtn.addEventListener('click', toggleThinkingMode);

// Initialize the app
document.addEventListener('DOMContentLoaded', initializeApp); 
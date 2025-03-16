# Llama Chat Desktop

A desktop chat application similar to ChatGPT, but using a local Llama model for AI responses. Built with Electron.js.

## Features

- Chat with a local Llama model
- Store and retrieve conversation history
- Create multiple conversations
- Clean, modern UI similar to ChatGPT

## Prerequisites

- Node.js (v14 or later)
- npm (v6 or later)
- A Llama model file (GGUF format)

## Installation

1. Clone this repository:
   ```
   git clone <repository-url>
   cd llama-chat-desktop
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Download a Llama model:
   - Download a GGUF format Llama model (e.g., llama-2-7b-chat.gguf)
   - Create a `models` directory in the project root
   - Place the model file in the `models` directory

## Usage

1. Start the application:
   ```
   npm start
   ```

2. The application will open with a new conversation.
3. Type your message in the input box and press Enter or click the send button.
4. The Llama model will generate a response based on your message and the conversation history.

## Configuration

You can modify the Llama model settings in `main.js`:

```javascript
const model = new LlamaModel({
  modelPath: modelPath,
  contextSize: 2048,  // Adjust based on your needs and model capabilities
  batchSize: 512,     // Adjust based on your hardware
  gpuLayers: 0        // Set to higher number if you have GPU support
});
```

## Troubleshooting

- **Model not found**: Ensure you've downloaded a Llama model and placed it in the `models` directory.
- **Slow responses**: Adjust the model parameters in `main.js` based on your hardware capabilities.
- **Out of memory errors**: Reduce the `contextSize` and `batchSize` parameters.

## License

MIT 
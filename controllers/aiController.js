// controllers/aiController.js
const fetch = require('node-fetch');
const FormData = require('form-data');

// OpenAI configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID || "asst_3kf3WzUfV5KmJlqKe8lLySPu";

// Helper function to make OpenAI API calls
const makeOpenAIRequest = async (endpoint, options) => {
  const response = await fetch(`https://api.openai.com/v1${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v2',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API Error: ${response.status} - ${errorText}`);
  }

  return response.json();
};

// Chat with AI Assistant
const chat = async (req, res) => {
  try {
    const { message, assistantType = 'analyst' } = req.body;
    
    if (!message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Message is required' 
      });
    }

    if (!OPENAI_API_KEY) {
      return res.status(503).json({
        success: false,
        error: 'OpenAI API key not configured'
      });
    }

    // Select appropriate assistant based on type
    let selectedAssistantId = ASSISTANT_ID; // Default to Nuvho Analyst
    if (assistantType === 'manager') {
      selectedAssistantId = process.env.OPENAI_MANAGER_ASSISTANT_ID || "asst_NS8hqSyzPQ0Hv3F7uOOuKJVk";
    }

    console.log(`🤖 Processing AI ${assistantType} request:`, message.substring(0, 50) + '...');

    // Create a new thread
    const threadData = await makeOpenAIRequest('/threads', {
      method: 'POST'
    });

    const threadId = threadData.id;

    // Add message to thread
    await makeOpenAIRequest(`/threads/${threadId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        role: 'user',
        content: message
      })
    });

    // Run the assistant
    const runData = await makeOpenAIRequest(`/threads/${threadId}/runs`, {
      method: 'POST',
      body: JSON.stringify({
        assistant_id: selectedAssistantId
      })
    });

    const runId = runData.id;
    if (!runId) {
      throw new Error('Failed to create run');
    }

    // Poll for completion
    let status = 'queued';
    let retries = 0;
    const maxRetries = 30;
    
    while (status !== 'completed' && retries < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const checkData = await makeOpenAIRequest(`/threads/${threadId}/runs/${runId}`, {
        method: 'GET'
      });
      
      status = checkData.status;
      
      if (status === 'failed' || status === 'cancelled' || status === 'expired') {
        throw new Error(`Run ${status}: ${checkData.last_error?.message || 'Unknown error'}`);
      }
      
      retries++;
    }

    if (status !== 'completed') {
      throw new Error('Request timeout - assistant took too long to respond');
    }

    // Get the response
    const messagesData = await makeOpenAIRequest(`/threads/${threadId}/messages`, {
      method: 'GET'
    });

    const assistantMessage = messagesData.data.find(m => m.role === 'assistant');
    const responseText = assistantMessage?.content?.[0]?.text?.value || 
                        'I apologize, but I couldn\'t generate a response. Please try again.';

    console.log(`✅ AI ${assistantType} response generated successfully`);

    res.json({ 
      success: true,
      response: responseText,
      assistantType,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ AI chat error:', error);
    res.status(500).json({ 
      success: false,
      error: 'I\'m experiencing technical difficulties. Please try again in a moment.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Transcribe audio to text
const transcribe = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No audio file provided' 
      });
    }

    if (!OPENAI_API_KEY) {
      return res.status(503).json({
        success: false,
        error: 'OpenAI API key not configured'
      });
    }

    console.log('🎤 Processing audio transcription...');

    const formData = new FormData();
    formData.append('file', req.file.buffer, {
      filename: 'audio.webm',
      contentType: req.file.mimetype
    });
    formData.append('model', 'whisper-1');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        ...formData.getHeaders()
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Transcription failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    console.log('✅ Audio transcription completed');

    res.json({ 
      success: true,
      text: data.text || '',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Transcription error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to transcribe audio',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Convert text to speech
const speak = async (req, res) => {
  try {
    const { text, voice = 'alloy' } = req.body;
    
    if (!text) {
      return res.status(400).json({ 
        success: false, 
        error: 'Text is required' 
      });
    }

    if (!OPENAI_API_KEY) {
      return res.status(503).json({
        success: false,
        error: 'OpenAI API key not configured'
      });
    }

    console.log('🔊 Processing text-to-speech...');

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: voice,
        response_format: 'mp3',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TTS failed: ${response.status} - ${errorText}`);
    }

    console.log('✅ Text-to-speech completed');

    // Stream the audio response back to client
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Disposition': 'attachment; filename="speech.mp3"'
    });
    
    response.body.pipe(res);

  } catch (error) {
    console.error('❌ Text-to-speech error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate speech',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Health check for AI services
const healthCheck = async (req, res) => {
  try {
    const hasApiKey = !!OPENAI_API_KEY;
    const hasAnalystId = !!ASSISTANT_ID;
    const hasManagerId = !!(process.env.OPENAI_MANAGER_ASSISTANT_ID || "asst_NS8hqSyzPQ0Hv3F7uOOuKJVk");

    res.json({
      success: true,
      status: 'AI services available',
      config: {
        apiKeyConfigured: hasApiKey,
        analystAssistantId: hasAnalystId ? ASSISTANT_ID : 'Not configured',
        managerAssistantId: hasManagerId ? (process.env.OPENAI_MANAGER_ASSISTANT_ID || "asst_NS8hqSyzPQ0Hv3F7uOOuKJVk") : 'Not configured'
      },
      features: {
        chat: hasApiKey && (hasAnalystId || hasManagerId),
        transcription: hasApiKey,
        textToSpeech: hasApiKey,
        nuvhoAnalyst: hasApiKey && hasAnalystId,
        nuvhoManager: hasApiKey && hasManagerId
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ AI health check error:', error);
    res.status(500).json({
      success: false,
      error: 'AI services health check failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  chat,
  transcribe,
  speak,
  healthCheck
};
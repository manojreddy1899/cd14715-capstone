import { query } from '@anthropic-ai/claude-agent-sdk';

async function test() {
  try {
    console.log('Starting query test...');
    const result = await query({
      prompt: 'Hello, what is 2+2?',
      model: process.env.ANTHROPIC_MODEL || 'claude-opus-4-5-20251101'
    });
    
    console.log('Query returned, iterating chunks...');
    for await (const chunk of result as any) {
      console.log('Chunk type:', Object.keys(chunk).join(', '));
      if (chunk.text) console.log('Text:', chunk.text.substring(0, 100));
      if (chunk.structured_output) console.log('Structured:', JSON.stringify(chunk.structured_output).substring(0, 100));
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

test();

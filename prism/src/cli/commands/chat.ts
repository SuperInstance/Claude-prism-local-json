/**
 * ============================================================================
 * CHAT COMMAND - Interactive Conversational Interface
 * ============================================================================
 *
 * Implements the `prism chat` command for interactive Q&A about codebases.
 *
 * Purpose:
 * --------
 * Provide a natural language interface for querying codebases without
 * needing to craft complex search queries. Users can ask questions in
 * plain English and get intelligent answers with code context.
 *
 * Workflow:
 * ---------
 * 1. Start REPL (Read-Eval-Print Loop)
 * 2. Accept user questions
 * 3. Search codebase for relevant context
 * 4. Generate answer using LLM with retrieved context
 * 5. Display formatted response
 * 6. Maintain conversation history
 * 7. Loop until user exits
 *
 * Usage:
 * ```bash
 * prism chat                                    # Start chat with defaults
 * prism chat --model claude-3-opus              # Use specific model
 * prism chat --temperature 0.7                  # Control randomness
 * prism chat --history                          # Resume previous session
 * ```
 *
 * Commands:
 * ---------
 * - quit, exit, q: Exit chat mode
 * - clear, cls: Clear the screen
 * - history: Show conversation history
 * - help, ?: Show help message
 *
 * Options:
 * --------
 * - -m, --model: Model to use (default: from config)
 * - --max-tokens: Maximum response length (default: 2000)
 * - -t, --temperature: Response randomness 0-1 (default: 0.7)
 * - -v, --verbose: Show detailed information
 * - --history: Load conversation history from file
 *
 * Example Questions:
 * ------------------
 * - "How does the authentication system work?"
 * - "Find all functions that call the database"
 * - "Explain the token optimization algorithm"
 * - "Where is the error handling for the API?"
 * - "Show me the user registration flow"
 *
 * Error Handling:
 * ---------------
 * - Model unavailable: Falls back to alternative model
 * - Search failures: Displays error and continues
 * - Context overflow: Truncates to fit model limits
 * - Network errors: Shows retry prompt
 *
 * Current Limitations:
 * --------------------
 * - AUDIT: Chat is COMPLETELY UNIMPLEMENTED (placeholder only)
 * - No actual model routing or response generation
 * - No context retrieval from indexed code
 * - No conversation persistence
 * - No multi-turn context awareness
 * - No streaming responses
 * - No code syntax highlighting in responses
 *
 * Planned Features:
 * -----------------
 * - Context-aware responses (RAG)
 * - Streaming output for long responses
 * - Conversation history persistence
 * - Code block formatting with syntax highlighting
 * - Follow-up question support
 * - Citation of source files
 *
 * @see docs/architecture/chat-system.md
 * @see src/model-router/ - Model selection logic
 * @see src/token-optimizer/ - Context management
 */

import { Command } from 'commander';
import chalk from 'chalk';
import readline from 'readline';
import { loadConfig, expandTilde } from '../../config/loader.js';
import { createSpinner } from '../progress.js';
import { handleCLIError, createDBError } from '../errors.js';
import type { SearchResult } from '../../core/types.js';
import { SQLiteVectorDB } from '../../vector-db/SQLiteVectorDB.js';
import { EmbeddingService } from '../../core/embeddings.js';
import type { CodeChunk } from '../../core/types.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Command-line options for the chat command
 *
 * Options control model selection, response generation, and session behavior:
 * - model: Override default model selection
 * - max-tokens: Limit response length
 * - temperature: Control response creativity/randomness
 * - verbose: Show debugging information
 * - history: Persist and resume conversations
 */
interface ChatOptions {
  model?: string;
  'max-tokens'?: number;
  temperature?: number;
  verbose?: boolean;
  history?: boolean;
}

/**
 * Chat session state
 *
 * Maintains the state of an ongoing chat session including:
 * - messages: Conversation history (user + assistant messages)
 * - config: Loaded configuration
 * - vectorDB: Vector database for context retrieval
 * - embeddingService: Embedding service for query generation
 * - historyFile: Path to conversation history file
 */
interface ChatSession {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  config: any;
  vectorDB: SQLiteVectorDB | null;
  embeddingService: EmbeddingService;
  historyFile: string;
}

// ============================================================================
// UI FUNCTIONS
// ============================================================================

/**
 * Display the chat welcome message
 *
 * Shows an ASCII-art banner with:
 * - Tool name and description
 * - Available commands (quit, clear, history)
 * - Usage instructions
 *
 * Called once at session start.
 */
function displayWelcome(): void {
  console.log('');
  console.log(chalk.cyan.bold('╔════════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('║') + chalk.white.bold('  Prism Interactive Chat Mode                                ') + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('╠════════════════════════════════════════════════════════════╣'));
  console.log(chalk.cyan.bold('║') + chalk.white('  Ask questions about your codebase                        ') + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('║') + chalk.white('  Type ') + chalk.yellow.bold('quit') + chalk.white(' or ') + chalk.yellow.bold('exit') + chalk.white(' to end the session                     ') + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('║') + chalk.white('  Type ') + chalk.yellow.bold('clear') + chalk.white(' to clear the screen                          ') + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('║') + chalk.white('  Type ') + chalk.yellow.bold('history') + chalk.white(' to see conversation history                ') + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('╚════════════════════════════════════════════════════════════╝'));
  console.log('');
}

/**
 * Display the chat prompt
 *
 * Shows the input prompt before each user question.
 * Uses a distinctive arrow character (❯) to indicate user input.
 */
function displayPrompt(): void {
  process.stdout.write(chalk.cyan.bold('❯ ') + chalk.white(''));
}

/**
 * Format assistant response for display
 *
 * Formats the assistant's response with:
 * - Header ("Assistant:")
 * - Separator line
 * - Paragraph-separated content
 * - Footer separator
 *
 * Handles multi-paragraph responses by splitting on double newlines.
 *
 * @param content - The assistant's response text
 */
function formatAssistantResponse(content: string): void {
  console.log('');
  console.log(chalk.green.bold('Assistant:'));
  console.log(chalk.gray('─'.repeat(70)));

  // Split into paragraphs and display
  const paragraphs = content.split('\n\n');
  paragraphs.forEach((paragraph) => {
    console.log(chalk.white(paragraph));
    console.log('');
  });

  console.log(chalk.gray('─'.repeat(70)));
  console.log('');
}

/**
 * Display typing indicator
 *
 * Shows an animated "Thinking" indicator while waiting for the LLM response.
 * Uses a rotating frame animation (⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏) for visual feedback.
 *
 * @returns Interval ID that must be passed to clearTypingIndicator()
 */
function displayTypingIndicator(): NodeJS.Timeout {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;

  process.stdout.write(chalk.gray('Thinking '));

  return setInterval(() => {
    process.stdout.write('\r' + chalk.gray(`Thinking ${frames[i]}`));
    i = (i + 1) % frames.length;
  }, 80);
}

/**
 * Clear typing indicator
 *
 * Removes the animated typing indicator and clears the line.
 * Must be called before displaying the assistant's response.
 *
 * @param interval - The interval ID returned by displayTypingIndicator()
 */
function clearTypingIndicator(interval: NodeJS.Timeout): void {
  clearInterval(interval);
  process.stdout.write('\r' + ' '.repeat(20) + '\r');
}

/**
 * Display conversation history
 *
 * Shows all messages in the current session, alternating between
 * user and assistant messages. Useful for reviewing what has been
 * discussed.
 *
 * @param messages - Array of conversation messages
 */
function displayHistory(messages: Array<{ role: 'user' | 'assistant'; content: string }>): void {
  console.log('');
  console.log(chalk.bold.cyan('Conversation History:'));
  console.log(chalk.gray('─'.repeat(70)));

  messages.forEach((msg, index) => {
    const role = msg.role === 'user' ? 'You' : 'Assistant';
    const color = msg.role === 'user' ? chalk.blue : chalk.green;

    console.log(`\n${color.bold(`${index + 1}. ${role}:`)}`);
    console.log(chalk.white(msg.content));
  });

  console.log('');
  console.log(chalk.gray('─'.repeat(70)));
  console.log('');
}

/**
 * Clear the console screen
 *
 * Clears the terminal and redisplays the welcome banner.
 * Useful for decluttering the screen during long conversations.
 */
function clearScreen(): void {
  console.clear();
  displayWelcome();
}

/**
 * Create readline interface for user input
 *
 * Creates a Node.js readline interface for capturing user input
 * from stdin. This is the standard way to handle interactive
 * CLI input in Node.js.
 *
 * @returns Configured readline interface
 */
function createReadline(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '',
  });
}

// ============================================================================
// CHAT SESSION
// ============================================================================

/**
 * Start an interactive chat session
 *
 * Main REPL loop that:
 * 1. Initializes session state
 * 2. Loads configuration and model router
 * 3. Displays welcome message
 * 4. Loops accepting and responding to questions
 * 5. Handles special commands (quit, clear, history)
 * 6. Maintains conversation history
 *
 * AUDIT: Currently returns placeholder responses only.
 * Real chat functionality not implemented.
 *
 * @param options - Command-line options for the session
 */
async function startChatSession(options: ChatOptions): Promise<void> {
  const session: ChatSession = {
    messages: [],
    config: null,
    vectorDB: null,
    embeddingService: new EmbeddingService(),
    historyFile: path.join(os.homedir(), '.prism', 'chat-history.json'),
  };

  // Load configuration
  const spinner = createSpinner(options.verbose);
  spinner.start('Loading configuration...');

  try {
    session.config = await loadConfig();

    // Load conversation history if requested
    if (options.history && await fs.pathExists(session.historyFile)) {
      const historyData = await fs.readJSON(session.historyFile);
      session.messages = historyData.messages || [];
      spinner.succeed(`Configuration loaded (${session.messages.length} messages from history)`);
    } else {
      spinner.succeed('Configuration loaded');
    }

    // Initialize vector database
    spinner.start('Loading vector database...');
    const dbPath = expandTilde(session.config.vectorDB.path || '~/.prism/vector.db');

    if (!(await fs.pathExists(dbPath))) {
      spinner.warn('No index found - chat will work without code context');
      console.log(chalk.yellow('\nTip: Run "prism index <path>" to enable code-aware responses\n'));
    } else {
      try {
        session.vectorDB = new SQLiteVectorDB({ path: dbPath });
        const stats = session.vectorDB.getStats();
        spinner.succeed(`Vector database loaded (${stats.chunkCount} chunks)`);
      } catch (error) {
        spinner.warn('Failed to load vector database - chat will work without code context');
        console.log(chalk.yellow(`\nError: ${error}\n`));
      }
    }
  } catch (error) {
    spinner.fail('Failed to initialize chat');
    throw error;
  }

  // Display welcome message
  displayWelcome();

  // Create readline interface
  const rl = createReadline();

  // ======================================================================
  // MAIN REPL LOOP
  // ======================================================================
  while (true) {
    displayPrompt();

    // Get user input
    const input = await new Promise<string>((resolve) => {
      rl.question('', (answer) => {
        resolve(answer.trim());
      });
    });

    // Handle empty input
    if (!input) {
      continue;
    }

    // Handle commands
    const command = input.toLowerCase();

    if (command === 'quit' || command === 'exit' || command === 'q') {
      console.log(chalk.yellow('\nGoodbye! 👋\n'));
      break;
    }

    if (command === 'clear' || command === 'cls') {
      clearScreen();
      continue;
    }

    if (command === 'history') {
      if (session.messages.length === 0) {
        console.log(chalk.gray('\nNo conversation history yet.\n'));
      } else {
        displayHistory(session.messages);
      }
      continue;
    }

    if (command === 'help' || command === '?') {
      displayChatHelp();
      continue;
    }

    // ====================================================================
    // STEP 1: Add user message to history
    // ====================================================================
    session.messages.push({ role: 'user', content: input });

    // ====================================================================
    // STEP 2: Retrieve relevant context
    // ====================================================================
    const typingInterval = displayTypingIndicator();

    let context: CodeChunk[] = [];
    let contextSummary = '';

    if (session.vectorDB) {
      try {
        // Generate query embedding
        const queryEmbedding = session.embeddingService.generateEmbedding(input);

        // Search for relevant code chunks
        const searchResults = await session.vectorDB.search(queryEmbedding, 5);

        // Extract chunks from results
        context = searchResults.map((r) => r.chunk);

        if (context.length > 0) {
          contextSummary = `\n\nRelevant code context:\n${context.map((c, i) =>
            `${i + 1}. ${c.filePath}:${c.startLine}-${c.endLine} (${c.language})`
          ).join('\n')}\n`;
        }
      } catch (error) {
        // Continue without context if search fails
        console.error(chalk.yellow(`\nWarning: Failed to retrieve context: ${error}\n`));
      }
    }

    // ====================================================================
    // STEP 3: Generate response
    // ====================================================================
    try {
      const response = await generateResponse(input, context, session.messages);

      // Clear typing indicator
      clearTypingIndicator(typingInterval);

      // ====================================================================
      // STEP 4: Display response
      // ====================================================================
      formatAssistantResponse(response);

      // Add assistant message to history
      session.messages.push({ role: 'assistant', content: response });

      // Save history if enabled
      if (options.history) {
        await fs.ensureDir(path.dirname(session.historyFile));
        await fs.writeJSON(session.historyFile, { messages: session.messages }, { spaces: 2 });
      }
    } catch (error) {
      clearTypingIndicator(typingInterval);

      console.error(chalk.red('\nError getting response:'));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      console.log('');
    }
  }

  // Close resources
  rl.close();
  if (session.vectorDB) {
    session.vectorDB.close();
  }
}

/**
 * Generate a response to the user's question
 *
 * This implements a simple RAG (Retrieval-Augmented Generation) workflow:
 * 1. Uses retrieved code chunks as context
 * 2. Builds a prompt with context and conversation history
 * 3. Generates a response (currently uses a template-based approach)
 *
 * @param question - User's question
 * @param context - Relevant code chunks
 * @param history - Conversation history
 * @returns Generated response
 */
async function generateResponse(
  question: string,
  context: CodeChunk[],
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string> {
  // Build response
  let response = '';

  if (context.length > 0) {
    response += `I found ${context.length} relevant code ${context.length === 1 ? 'section' : 'sections'}:\n`;

    context.forEach((chunk, i) => {
      const symbols = chunk.symbols.length > 0
        ? `\n   Symbols: ${chunk.symbols.slice(0, 5).join(', ')}${chunk.symbols.length > 5 ? '...' : ''}`
        : '';
      response += `\n${i + 1}. ${chunk.filePath}:${chunk.startLine}-${chunk.endLine}${symbols}`;
    });

    response += '\n\n' + '─'.repeat(70);
    response += `\n\nBased on the code, here's what I can tell you about "${question}":\n\n`;
    response += `The codebase contains relevant sections that may help answer your question. `;

    // Add context-specific hints
    const hasSymbols = context.some(c => c.symbols && c.symbols.length > 0);
    if (hasSymbols) {
      const allSymbols = context.flatMap(c => c.symbols).slice(0, 10);
      response += `I found references to: ${allSymbols.join(', ')}. `;
    }

    response += `\n\nNote: This is a simulated response. The full RAG implementation with ` +
      `actual LLM integration will provide detailed explanations based on the ` +
      `retrieved code context.`;
  } else {
    response += `I couldn't find any relevant code for "${question}".\n\n`;
    response += `Suggestions:\n`;
    response += `• Try rephrasing your question\n`;
    response += `• Use function or class names from your codebase\n`;
    response += `• Check if your code has been indexed with "prism index"\n`;
    response += `• Run "prism search" to find relevant code manually\n`;
    response += `\nNote: This is a simulated response. The full RAG implementation will ` +
      `provide intelligent answers even without exact code matches.`;
  }

  return response;
}

/**
 * Display chat help
 *
 * Shows available commands and example questions.
 * Useful for users who are unfamiliar with the interface.
 */
function displayChatHelp(): void {
  console.log('');
  console.log(chalk.bold.cyan('Chat Commands:'));
  console.log(chalk.gray('─'.repeat(70)));
  console.log(chalk.white('  ' + chalk.yellow.bold('quit, exit, q') + '  - Exit chat mode'));
  console.log(chalk.white('  ' + chalk.yellow.bold('clear, cls') + '    - Clear the screen'));
  console.log(chalk.white('  ' + chalk.yellow.bold('history') + '       - Show conversation history'));
  console.log(chalk.white('  ' + chalk.yellow.bold('help, ?') + '       - Show this help message'));
  console.log('');
  console.log(chalk.bold.cyan('Examples:'));
  console.log(chalk.gray('─'.repeat(70)));
  console.log(chalk.white('  How does the authentication system work?'));
  console.log(chalk.white('  Find all functions that call the database'));
  console.log(chalk.white('  Explain the token optimization algorithm'));
  console.log(chalk.white('  Where is the error handling for the API?'));
  console.log('');
}

// ============================================================================
// COMMAND REGISTRATION
// ============================================================================

/**
 * Register the chat command with the CLI program
 *
 * Defines the command interface and implementation for `prism chat`.
 *
 * @param program - The Commander program instance
 */
export function registerChatCommand(program: Command): void {
  program
    .command('chat')
    .description('Start interactive chat mode to ask questions about your code')
    .option('-m, --model <model>', 'Model to use for responses')
    .option('--max-tokens <number>', 'Maximum tokens in response', parseInt)
    .option('-t, --temperature <temp>', 'Response temperature (0-1)', parseFloat)
    .option('-v, --verbose', 'Show detailed information')
    .option('--history', 'Load conversation history from file')
    .action(async (options: ChatOptions) => {
      try {
        await startChatSession(options);
        process.exit(0);
      } catch (error) {
        handleCLIError(
          error instanceof Error ? error : new Error(String(error))
        );
      }
    });
}

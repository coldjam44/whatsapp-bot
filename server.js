import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';

// Configuration constants
const PORT = 8046;
const TEST_NUMBER = "966504693227";

// Global state management
const globalState = {
    isAuthenticated: false,
    currentQR: null,
    userInfo: null,
    client: null,
    readyEventFired: false,
    authTime: null,
    heartbeatInterval: null,
    botStats: null
};

// Global bulk messaging state

// WebSocket-based bulk messaging processing function


// Logger utility
const logger = {
    info: (message, details = []) => {
        console.log(`ℹ️  ${message}`);
        details.forEach(detail => console.log(`   • ${detail}`));
    },
    success: (message, details = []) => {
        console.log(`✅ ${message}`);
        details.forEach(detail => console.log(`   • ${detail}`));
    },
    warning: (message, details = []) => {
        console.log(`⚠️  ${message}`);
        details.forEach(detail => console.log(`   • ${detail}`));
    },
    error: (message, details = []) => {
        console.error(`❌ ${message}`);
        details.forEach(detail => console.error(`   • ${detail}`));
    },
    step: (stepNumber, title, details = []) => {
        console.log(`🔧 Step ${stepNumber}: ${title}`);
        details.forEach(detail => console.log(`   • ${detail}`));
    }
};

// WhatsApp client configuration
const createWhatsAppClient = () => {
    logger.step(1, 'Initializing WhatsApp Client', [
        'Authentication Strategy: LocalAuth',
        'Puppeteer Mode: Headless',
        'Browser Args: --no-sandbox, --disable-setuid-sandbox, etc.'
    ]);

    return new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process'
            ]
        }
    });
};

// QR code generation
const generateQRCode = async (qr) => {
    try {
        logger.step(2, 'Generating QR Code', [
            'Event: QR code received from WhatsApp',
            'Status: Waiting for user to scan'
        ]);

        if (globalState.isAuthenticated) {
            logger.success('Already authenticated, skipping QR code generation');
            return;
        }

        // Generate terminal QR code
        qrcode.generate(qr, { small: true });
        logger.info('QR Code Generated', [
            'Action Required: Open WhatsApp on your phone',
            'Action Required: Go to Settings > Linked Devices',
            'Action Required: Tap "Link a Device"',
            'Action Required: Scan the QR code above'
        ]);

        // Generate browser QR code
        const qrDataURL = await QRCode.toDataURL(qr, {
            width: 300,
            margin: 2,
            color: { dark: '#000000', light: '#FFFFFF' }
        });

        globalState.currentQR = qrDataURL;
        logger.success('QR code generated for browser display', [
            'Browser Dashboard: QR code is now visible',
            'Auto-refresh: Dashboard will refresh every 2 seconds'
        ]);

    } catch (error) {
        logger.error('Error generating QR code for browser', [error.message]);
    }
};

// User information retrieval with retry logic
const getUserInfo = async (client, attempt = 1) => {
    const maxAttempts = 3;
    const delays = [5000, 10000, 15000];

    logger.step(3, `Attempting to retrieve user information (Attempt ${attempt}/${maxAttempts})`);

    try {
        const user = client.info;
        logger.info(`Debug: client.info =`, [JSON.stringify(user, null, 2)]);

        if (user?.pushname && user?.wid) {
            logger.success('User Information Retrieved Successfully!', [
                `Display Name: ${user.pushname}`,
                `Phone Number: ${user.wid.user}`,
                `Platform: ${user.platform || 'Unknown'}`
            ]);

            globalState.userInfo = user;
            return user;
        }

        if (attempt < maxAttempts) {
            logger.warning('User info not available, retrying...', [
                `Next attempt in ${delays[attempt - 1] / 1000} seconds`
            ]);

            setTimeout(() => getUserInfo(client, attempt + 1), delays[attempt - 1]);
        } else {
            logger.warning('All attempts failed, using fallback info');
            const fallbackInfo = {
                pushname: 'WhatsApp User',
                wid: { user: 'Connected', _serialized: 'Connected' },
                platform: 'WhatsApp Web',
                connectionTime: new Date().toLocaleString()
            };
            globalState.userInfo = fallbackInfo;
            return fallbackInfo;
        }

    } catch (error) {
        logger.error('Error retrieving user info', [error.message]);
        
        if (attempt < maxAttempts) {
            setTimeout(() => getUserInfo(client, attempt + 1), delays[attempt - 1]);
        } else {
            const fallbackInfo = {
                pushname: 'WhatsApp User',
                wid: { user: 'Connected', _serialized: 'Connected' },
                platform: 'WhatsApp Web',
                connectionTime: new Date().toLocaleString()
            };
            globalState.userInfo = fallbackInfo;
            return fallbackInfo;
        }
    }
};

// Connection message sender
const sendConnectionMessage = async (client) => {
    logger.step(4, 'Sending Connection Message', [
        `Target: ${TEST_NUMBER}`,
        'Purpose: Confirm bot is operational',
        'Timing: After client is ready'
    ]);

    try {
        const timestamp = new Date().toLocaleString('en-US', {
            timeZone: 'Asia/Riyadh',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });

        logger.success('Bot is now fully operational!', [
            'Status: Ready to handle messages',
            'No automatic connection message sent'
        ]);
    } catch (error) {
        logger.error('Error in connection message function', [error.message]);
    }
};

// Message handler
const handleMessage = async (message) => {
    logger.step(5, 'Message Received', [
        `From: ${message.from}`,
        `Type: ${message.type}`,
        `Content: ${message.body || 'Media/Other'}`,
        `Timestamp: ${new Date().toLocaleString()}`
    ]);

    try {
        await message.reply("Hello World! 👋");
        logger.success('Successfully replied to message', [
            `Reply sent: "Hello World! 👋"`,
            'Status: Message delivered'
        ]);
    } catch (error) {
        logger.error('Error sending reply', [
            `Failed to reply to ${message.from}`,
            `Error details: ${error.message}`
        ]);
    }
};

// Event handlers setup
const setupEventHandlers = (client) => {
    logger.step(6, 'Setting up Event Handlers');

    // QR Code event
    client.on('qr', generateQRCode);
    logger.info('QR event handler registered');

    // Authentication events
    client.on('authenticated', () => {
        logger.success('WhatsApp Client Authenticated!', [
            'Event: User successfully scanned QR code',
            'Status: WhatsApp Web session established',
            'Action: User tapped "Yes" to confirm login'
        ]);

        globalState.isAuthenticated = true;
        globalState.currentQR = null;
        logger.info('Global state updated for authentication');

        logger.info('Connection Information', [
            'Authentication: ✅ Success',
            'Status: Connected',
            'Session: Active',
            'QR Code: No longer needed',
            'Auto-refresh: Disabled',
            'Message handling: Active',
            'Hello World replies: Enabled'
        ]);
        
        logger.info('⏳ Waiting for ready event...');
        logger.info('Starting heartbeat monitoring...');
        
        // Start heartbeat logging every second
        const heartbeatInterval = setInterval(() => {
            const now = new Date();
            const elapsed = Math.floor((now - globalState.authTime) / 1000);
            
            // Get detailed client status
            const clientStatus = {
                hasPupPage: !!client.pupPage,
                hasInfo: !!client.info,
                readyEventFired: globalState.readyEventFired,
                browserUrl: client.pupPage?.url || 'Not available',
                pageTitle: client.pupPage?.title || 'Not available'
            };
            
            logger.info(`💓 Heartbeat: ${elapsed}s elapsed since authentication`, [
                `Current time: ${now.toLocaleTimeString()}`,
                `Browser active: ${clientStatus.hasPupPage ? '✅ Yes' : '❌ No'}`,
                `Client info available: ${clientStatus.hasInfo ? '✅ Yes' : '❌ No'}`,
                `Ready event fired: ${clientStatus.readyEventFired ? '✅ Yes' : '❌ No'}`,
                `Browser URL: ${clientStatus.browserUrl}`,
                `Page title: ${clientStatus.pageTitle}`
            ]);
            
            // Check if we've been waiting too long
            if (elapsed > 60) {
                logger.warning('⚠️  Ready event taking longer than expected', [
                    'This may indicate an issue with WhatsApp Web',
                    'Consider checking browser console for errors',
                    'Client may need to be restarted'
                ]);
            }
            
            // Additional checks every 10 seconds
            if (elapsed % 10 === 0 && elapsed > 0) {
                logger.info(`🔍 Detailed status check at ${elapsed}s:`, [
                    `Client object keys: ${Object.keys(client).join(', ')}`,
                    `Global state keys: ${Object.keys(globalState).join(', ')}`,
                    `Process memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
                ]);
            }
        }, 1000);
        
        // Store the interval ID to clear it later
        globalState.heartbeatInterval = heartbeatInterval;
        
        // Store authentication time for elapsed calculation
        globalState.authTime = new Date();
    });

    client.on('ready', async () => {
        logger.info('🎉 Ready event fired! Starting client initialization...');
        
        // Update global state
        globalState.readyEventFired = true;
        
        // Clear heartbeat monitoring
        if (globalState.heartbeatInterval) {
            clearInterval(globalState.heartbeatInterval);
            logger.info('💓 Heartbeat monitoring stopped');
        }
        
        logger.success('WhatsApp Client Ready!', [
            'Event: Client fully initialized and operational',
            'Status: All systems go - ready to handle messages',
            'Action: WhatsApp Web is now fully loaded'
        ]);

        logger.info('Bot Status', [
            'WhatsApp Web: ✅ Ready',
            'Message Listener: ✅ Active',
            'Real Estate Bot: ✅ Loaded',
            'User Data Collection: ✅ Active',
            'Multi-language Support: ✅ Arabic/English',
            `Server Port: ${PORT}`,
            `Dashboard: http://localhost:${PORT}`
        ]);

        try {
            // Get user info with retry logic
            logger.info('Starting user info retrieval...');
            await getUserInfo(client);
            logger.success('User info retrieval completed');
        } catch (error) {
            logger.error('Error in ready event handler', [error.message]);
        }

        // Send connection message
        setTimeout(() => {
            try {
                sendConnectionMessage(client);
            } catch (error) {
                logger.error('Error sending connection message', [error.message]);
            }
        }, 3000);
    });

    client.on('auth_failure', (msg) => {
        logger.error('Authentication Failed!', [
            'Event: WhatsApp authentication rejected',
            `Reason: ${msg}`,
            'Action Required: Check phone connection',
            'Action Required: Ensure WhatsApp is working',
            'Action Required: Try scanning QR code again'
        ]);
    });

    client.on('disconnected', (reason) => {
        logger.warning('WhatsApp Client Disconnected!', [
            'Event: Connection lost to WhatsApp',
            `Reason: ${reason}`,
            'Status: Bot is offline',
            'Action: Client will attempt to reconnect'
        ]);
    });

    // Message handling - Now handled by replays.js
    // client.on('message', handleMessage); // Commented out - handled by real estate bot
    logger.info('Message event handler will be registered by replays.js');
    
    logger.success('All event handlers registered successfully');
};

// Express server setup
const createExpressServer = () => {
    logger.step(7, 'Creating Express Server', [
        `Port: ${PORT}`,
        'Purpose: Web dashboard for monitoring',
        `URL: http://localhost:${PORT}`
    ]);

    const app = express();

    // Add JSON parsing middleware for POST requests
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Serve static files (CSS, JS)
    app.use(express.static('public'));

    app.get('/', (req, res) => {
        const qrImage = globalState.currentQR ? 
            `<img src="${globalState.currentQR}" alt="QR Code" style="max-width: 300px; border: 2px solid #333;">` :
            '<p>⏳ Waiting for QR code...</p>';

        const html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>WhatsApp Bot Dashboard</title>
                <style>
                    body { 
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                        text-align: center; 
                        padding: 0; 
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: #333;
                        margin: 0;
                    }
                    .nav {
                        background: rgba(255, 255, 255, 0.95);
                        backdrop-filter: blur(10px);
                        padding: 15px 0;
                        box-shadow: 0 2px 20px rgba(0,0,0,0.1);
                        position: sticky;
                        top: 0;
                        z-index: 1000;
                    }
                    .nav-container {
                        max-width: 1200px;
                        margin: 0 auto;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 0 20px;
                    }
                    .nav-brand {
                        font-size: 24px;
                        font-weight: bold;
                        color: #2c3e50;
                        text-decoration: none;
                    }
                    .nav-links {
                        display: flex;
                        gap: 20px;
                    }
                    .nav-link {
                        color: #34495e;
                        text-decoration: none;
                        padding: 10px 15px;
                        border-radius: 8px;
                        transition: all 0.3s ease;
                    }
                    .nav-link:hover {
                        background: #667eea;
                        color: white;
                    }
                    .nav-link.active {
                        background: #667eea;
                        color: white;
                    }
                    .container { 
                        max-width: 800px; 
                        margin: 40px auto; 
                        background: white;
                        border-radius: 15px;
                        padding: 30px;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                    }
                    .qr-container { 
                        margin: 20px 0; 
                        padding: 20px; 
                        border: 1px solid #ddd; 
                        border-radius: 10px; 
                        background: #f8f9fa;
                    }
                    .status { 
                        padding: 15px; 
                        margin: 15px 0; 
                        border-radius: 8px; 
                        font-weight: bold;
                    }
                    .waiting { background-color: #fff3cd; color: #856404; border: 1px solid #ffeaa7; }
                    .ready { background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
                    h1 { color: #2c3e50; margin-bottom: 30px; }
                    h3, h4 { color: #34495e; }
                    .info-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                        gap: 20px;
                        margin: 20px 0;
                    }
                    .info-card {
                        background: #f8f9fa;
                        padding: 20px;
                        border-radius: 10px;
                        border: 1px solid #e9ecef;
                        text-align: left;
                    }
                    .info-card p {
                        margin: 8px 0;
                        padding: 5px 0;
                        border-bottom: 1px solid #e9ecef;
                    }
                    .info-card strong {
                        color: #495057;
                    }
                </style>
                <script>
                    let refreshInterval;
                    
                    function startAutoRefresh() {
                        refreshInterval = setInterval(() => {
                            location.reload();
                        }, 2000);
                    }
                    
                    function stopAutoRefresh() {
                        if (refreshInterval) {
                            clearInterval(refreshInterval);
                            console.log('🔄 Auto-refresh stopped - Bot is authenticated');
                        }
                    }
                    

                    window.onload = function() {
                        if (!${globalState.isAuthenticated}) {
                            startAutoRefresh();
                        }
                    };
                    
                    if (${globalState.isAuthenticated} || ${globalState.currentQR ? 'true' : 'false'}) {
                        stopAutoRefresh();
                    }
                </script>
            </head>
            <body>
                <nav class="nav">
                    <div class="nav-container">
                        <a href="/" class="nav-brand">🤖 WhatsApp Bot</a>
                        <div class="nav-links">
                            <a href="/" class="nav-link active">Dashboard</a>
                            <a href="/bulk-messaging" class="nav-link">📤 Bulk Messaging</a>
                        </div>
                    </div>
                </nav>

                <div class="container">
                    <h1>🤖 WhatsApp Bot Dashboard</h1>
                    <p><strong>Bot is running on port ${PORT}</strong></p>
                    
                    ${globalState.isAuthenticated ? `
                        <div class="qr-container" style="background-color: #d4edda; border-color: #28a745;">
                            <h3>✅ WhatsApp Bot Connected</h3>
                            <p>🤖 Bot is now active and listening for messages</p>
                            <p>📱 Status: Authenticated and Ready</p>
                            
                            <div class="info-grid">
                                <div class="info-card">
                                    <h4>👤 Connected Account Details:</h4>
                                    <p><strong>📱 Display Name:</strong> ${globalState.userInfo?.pushname || 'Loading...'}</p>
                                    <p><strong>📞 Phone Number:</strong> ${globalState.userInfo?.wid?.user || 'Loading...'}</p>
                                    <p><strong>🆔 Full WhatsApp ID:</strong> ${globalState.userInfo?.wid?._serialized || 'Loading...'}</p>
                                    <p><strong>💻 Platform:</strong> ${globalState.userInfo?.platform || 'Loading...'}</p>
                                    <p><strong>⏰ Connected:</strong> ${new Date().toLocaleString()}</p>
                                    <p><strong>🔑 Session ID:</strong> ${globalState.userInfo?.wid?.user || 'Loading...'}</p>
                                    <p><strong>📋 Account Type:</strong> Personal WhatsApp</p>
                                    <p><strong>🟢 Status:</strong> Active and Connected</p>
                                </div>
                                
                                <div class="info-card">
                                    <h4>📱 Phone Device Details:</h4>
                                    <p><strong>📱 Phone Name:</strong> ${globalState.userInfo?.pushname || 'Loading...'}</p>
                                    <p><strong>📞 Phone Number:</strong> ${globalState.userInfo?.wid?.user || 'Loading...'}</p>
                                    <p><strong>💻 Device Platform:</strong> ${globalState.userInfo?.platform || 'Loading...'}</p>
                                    <p><strong>🆔 Device ID:</strong> ${globalState.userInfo?.wid?._serialized || 'Loading...'}</p>
                                    <p><strong>⏰ Last Login:</strong> ${new Date().toLocaleString()}</p>
                                    <p><strong>🔐 Login Method:</strong> WhatsApp Web</p>
                                    <p><strong>📱 App Version:</strong> Latest</p>
                                    <p><strong>🟢 Connection Status:</strong> Active</p>
                                </div>
                            </div>
                        </div>
                    ` : `
                        <div class="qr-container">
                            <h3>🔐 WhatsApp Authentication</h3>
                            ${qrImage}
                            <p>📱 Scan this QR code with your WhatsApp app to log in</p>
                        </div>
                    `}
                    
                    <div class="status ${globalState.isAuthenticated ? 'ready' : (globalState.currentQR ? 'ready' : 'waiting')}">
                        ${globalState.isAuthenticated ? '✅ Bot Connected - Ready to Handle Messages' : (globalState.currentQR ? '✅ QR Code Available - Ready to Scan' : '⏳ Waiting for QR code...')}
                    </div>
                    
                    <div style="margin-top: 20px; font-size: 12px; color: #666;">
                        ${globalState.isAuthenticated ? 
                            '<p>✅ Bot is authenticated - No more QR codes needed</p>' : 
                            '<p>🔄 Page will auto-refresh every 2 seconds until QR code appears</p>'
                        }
                    </div>
                    
                    ${globalState.isAuthenticated ? `
                        <div class="qr-container" style="background-color: #e3f2fd; border-color: #2196f3; margin-top: 30px;">
                            <h3>📤 Bulk Messaging Tool</h3>
                            <p>Send messages to multiple phone numbers at once using our dedicated bulk messaging page</p>
                            <a href="/bulk-messaging" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 15px 30px; border-radius: 8px; font-weight: bold; transition: all 0.3s ease;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                                🚀 Go to Bulk Messaging Tool
                            </a>
                        </div>
                    ` : ''}
                </div>
            </body>
            </html>
        `;

        res.send(html);
    });

    // Bulk messaging page route
    app.get('/bulk-messaging', (req, res) => {
        res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bulk Messaging Tool - WhatsApp Bot</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            margin: 0;
            background: #f0f2f5;
            color: #333;
        }
        .nav {
            background: #fff;
            padding: 15px 0;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            position: sticky;
            top: 0;
            z-index: 1000;
        }
        .nav-container {
            max-width: 1200px;
            margin: 0 auto;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 20px;
        }
        .nav-brand {
            font-size: 24px;
            font-weight: bold;
            color: #2c3e50;
            text-decoration: none;
        }
        .nav-links {
            display: flex;
            gap: 20px;
        }
        .nav-link {
            color: #34495e;
            text-decoration: none;
            padding: 10px 15px;
            border-radius: 8px;
            transition: all 0.3s ease;
        }
        .nav-link:hover {
            background: #667eea;
            color: white;
        }
        .nav-link.active {
            background: #667eea;
            color: white;
        }
        .container {
            max-width: 800px;
            margin: 40px auto;
            background: white;
            border-radius: 15px;
            padding: 30px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .header h1 {
            color: #2c3e50;
            margin-bottom: 10px;
        }
        .form-group {
            margin-bottom: 25px;
        }
        .form-label {
            display: block;
            margin-bottom: 8px;
            font-weight: bold;
            color: #333;
            font-size: 16px;
        }
        .form-input {
            width: 100%;
            padding: 15px;
            border: 2px solid #e0e0e0;
            border-radius: 10px;
            font-size: 14px;
            transition: border-color 0.3s ease;
            box-sizing: border-box;
        }
        .form-input:focus {
            outline: none;
            border-color: #667eea;
        }
        .form-textarea {
            min-height: 120px;
            resize: vertical;
        }
        .btn-group {
            display: flex;
            gap: 15px;
            justify-content: center;
            margin-top: 30px;
        }
        .btn {
            padding: 15px 30px;
            border: none;
            border-radius: 10px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s ease;
            text-decoration: none;
            display: inline-block;
            text-align: center;
        }
        .btn-primary {
            background: #667eea;
            color: white;
        }
        .btn-primary:hover {
            background: #5a6fd8;
            transform: translateY(-2px);
        }
        .btn-primary:disabled {
            background: #ccc;
            cursor: not-allowed;
            transform: none;
        }
        .btn-secondary {
            background: #6c757d;
            color: white;
        }
        .btn-secondary:hover {
            background: #5a6268;
        }
        .connection-status {
            position: fixed;
            top: 80px;
            right: 20px;
            padding: 10px 15px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: bold;
            z-index: 1001;
        }
        .status-connected {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .status-disconnected {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        .logging-container {
            margin-top: 30px;
            background: #1e1e1e;
            border-radius: 10px;
            padding: 20px;
            color: #00ff00;
            font-family: monospace;
        }
        .logBox {
            background: #000;
            padding: 15px;
            border-radius: 8px;
            height: 300px;
            overflow-y: auto;
            font-size: 12px;
            line-height: 1.4;
        }
    </style>
</head>
<body>
    <nav class="nav">
        <div class="nav-container">
            <a href="/" class="nav-brand">WhatsApp Bot</a>
            <div class="nav-links">
                <a href="/" class="nav-link">Dashboard</a>
                <a href="/bulk-messaging" class="nav-link active">Bulk Messaging</a>
            </div>
        </div>
    </nav>

    <div class="connection-status" id="connectionStatus">
        <span id="statusText">Ready to send</span>
    </div>

    <div class="container">
        <div class="header">
            <h1>Bulk Messaging Tool</h1>
            <p>Send messages to multiple phone numbers at once using WhatsApp</p>
        </div>

        <form id="bulkMessageForm">
            <div class="form-group">
                <label for="phoneNumbers" class="form-label">
                    Phone Numbers (one per line or separated by /):
                </label>
                <textarea 
                    id="phoneNumbers" 
                    name="phoneNumbers" 
                    class="form-input form-textarea"
                    placeholder="+966501234567, +1234567890, 00442012345678"
                    required
                ></textarea>
                <small style="color: #666; font-size: 12px;">
                    Format: One number per line OR separated by forward slashes (/)
                </small>
            </div>
            
            <div class="form-group">
                <label for="messageText" class="form-label">
                    Message:
                </label>
                <textarea 
                    id="messageText" 
                    name="messageText" 
                    class="form-input form-textarea"
                    placeholder="Type your message here..."
                    required
                ></textarea>
            </div>
            
            <div class="btn-group">
                <button type="button" id="sendBtn" class="btn btn-primary">
                    Send
                </button>
                <button type="button" id="clearFormBtn" class="btn btn-secondary">
                    Clear Form
                </button>
            </div>
        </form>

        <div class="logging-container">
            <h3 style="color: #fff; margin-bottom: 15px;">Real-time Logs</h3>
            <div id="logBox" class="logBox">
                <div style="color: #888;">Waiting for bulk messaging to start...</div>
            </div>
            <div style="margin-top: 10px; display: flex; gap: 10px;">
                <button id="clearLogsBtn" class="btn btn-secondary" style="padding: 8px 15px; font-size: 12px;">
                    Clear Logs
                </button>
                <button id="copyLogsBtn" class="btn btn-secondary" style="padding: 8px 15px; font-size: 12px;">
                    Copy Logs
                </button>
            </div>
        </div>
    </div>

    <script>
        // WebSocket connection
        let ws = null;
        let isConnected = false;

        // Logging functionality
        function addLog(message, type) {
            const logBox = document.getElementById('logBox');
            const timestamp = new Date().toLocaleTimeString();
            const logEntry = document.createElement('div');
            
            let color = '#00ff00';
            if (type === 'error') color = '#ff4444';
            if (type === 'warning') color = '#ffaa00';
            if (type === 'success') color = '#44ff44';
            
            logEntry.innerHTML = '<span style="color: #888;">[' + timestamp + ']</span> <span style="color: ' + color + ';">' + message + '</span>';
            logBox.appendChild(logEntry);
            
            logBox.scrollTop = logBox.scrollHeight;
            
            if (logBox.children.length > 100) {
                logBox.removeChild(logBox.firstChild);
            }
        }

        function updateConnectionStatus(text, connected) {
            const statusEl = document.getElementById('connectionStatus');
            const statusTextEl = document.getElementById('statusText');
            
            statusEl.className = 'connection-status ' + (connected ? 'status-connected' : 'status-disconnected');
            statusTextEl.textContent = connected ? 'Connected' : text;
        }

        // Form handling
        function parsePhoneNumbers(input) {
            let numbers = input.split('\n');
            let allNumbers = [];
            
            for (let line of numbers) {
                let lineNumbers = line.split('/');
                for (let num of lineNumbers) {
                    let trimmed = num.trim();
                    if (trimmed.length > 0) {
                        allNumbers.push(trimmed);
                    }
                }
            }
            
            return allNumbers;
        }

        function validatePhoneNumber(phone) {
            let cleanPhone = '';
            for (let char of phone) {
                if ((char >= '0' && char <= '9') || char === '+' || char === ' ') {
                    cleanPhone += char;
                }
            }
            
            cleanPhone = cleanPhone.trim();
            
            if (cleanPhone.length === 0) return false;
            
            if (cleanPhone.startsWith('+') && cleanPhone.length >= 8 && cleanPhone.length <= 16) {
                let digitsOnly = true;
                for (let i = 1; i < cleanPhone.length; i++) {
                    if (cleanPhone[i] < '0' || cleanPhone[i] > '9') {
                        digitsOnly = false;
                        break;
                    }
                }
                if (digitsOnly) return true;
            }
            
            if (cleanPhone.startsWith('00') && cleanPhone.length >= 10 && cleanPhone.length <= 18) {
                let digitsOnly = true;
                for (let char of cleanPhone) {
                    if (char < '0' || char > '9') {
                        digitsOnly = false;
                        break;
                    }
                }
                if (digitsOnly) return true;
            }
            
            if (cleanPhone.length >= 7 && cleanPhone.length <= 15) {
                let digitsOnly = true;
                for (let char of cleanPhone) {
                    if (char < '0' || char > '9') {
                        digitsOnly = false;
                        break;
                    }
                }
                if (digitsOnly) return true;
            }
            
            return false;
        }

        function clearForm() {
            document.getElementById('phoneNumbers').value = '';
            document.getElementById('messageText').value = '';
        }

        // Send button handler
        function handleSendClick() {
            const sendBtn = document.getElementById('sendBtn');
            const phoneNumbers = document.getElementById('phoneNumbers').value;
            const message = document.getElementById('messageText').value;
            
            if (!phoneNumbers.trim() || !message.trim()) {
                addLog('Please fill in both phone numbers and message fields', 'error');
                return;
            }
            
            const parsedNumbers = parsePhoneNumbers(phoneNumbers);
            if (parsedNumbers.length === 0) {
                addLog('Please enter valid phone numbers', 'error');
                return;
            }
            
            sendBtn.disabled = true;
            sendBtn.textContent = 'Sending...';
            
            document.getElementById('logBox').innerHTML = '';
            addLog('Starting bulk messaging...', 'success');
            addLog('Total numbers: ' + parsedNumbers.length, 'info');
            addLog('Message: ' + message.substring(0, 50) + '...', 'info');
            
            startWebSocketAndSend(parsedNumbers, message);
        }
        
        // WebSocket connection and sending
        function startWebSocketAndSend(phoneNumbers, message) {
            addLog('Connecting to WebSocket...', 'info');
            
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = protocol + '//' + window.location.host + '/ws';
            
            ws = new WebSocket(wsUrl);
            
            ws.onopen = function() {
                isConnected = true;
                addLog('WebSocket connected!', 'success');
                updateConnectionStatus('WebSocket Connected', true);
                
                ws.send(JSON.stringify({
                    type: 'start_bulk_messaging',
                    phoneNumbers: phoneNumbers,
                    message: message
                }));
            };
            
            ws.onmessage = function(event) {
                const data = JSON.parse(event.data);
                handleWebSocketMessage(data);
            };
            
            ws.onclose = function() {
                isConnected = false;
                addLog('WebSocket disconnected', 'error');
                updateConnectionStatus('WebSocket Disconnected', false);
                
                const sendBtn = document.getElementById('sendBtn');
                sendBtn.disabled = false;
                sendBtn.textContent = 'Send';
            };
            
            ws.onerror = function(error) {
                addLog('WebSocket error: ' + error.message, 'error');
                
                const sendBtn = document.getElementById('sendBtn');
                sendBtn.disabled = false;
                sendBtn.textContent = 'Send';
            };
        }

        function handleWebSocketMessage(data) {
            switch(data.type) {
                case 'bulk_progress':
                    addLog('Progress: ' + data.current + '/' + data.total + ' sent (' + data.progress + '%)', 'info');
                    if (data.success > 0) addLog('Success: ' + data.success + ' messages sent', 'success');
                    if (data.failed > 0) addLog('Failed: ' + data.failed + ' messages', 'error');
                    break;
                case 'bulk_complete':
                    addLog('Bulk messaging completed!', 'success');
                    addLog('Final Results: ' + data.success + ' success, ' + data.failed + ' failed', 'info');
                    
                    const sendBtn = document.getElementById('sendBtn');
                    if (sendBtn) {
                        sendBtn.disabled = false;
                        sendBtn.textContent = 'Send';
                    }
                    break;
                case 'bulk_log':
                    addLog(data.message, data.logType || 'info');
                    break;
                default:
                    addLog('Received: ' + JSON.stringify(data), 'info');
            }
        }

        // Event listeners
        document.addEventListener('DOMContentLoaded', function() {
            const sendBtn = document.getElementById('sendBtn');
            const clearBtn = document.getElementById('clearFormBtn');
            
            if (sendBtn) {
                sendBtn.addEventListener('click', handleSendClick);
            }
            
            if (clearBtn) {
                clearBtn.addEventListener('click', clearForm);
            }

            const clearLogsBtn = document.getElementById('clearLogsBtn');
            const copyLogsBtn = document.getElementById('copyLogsBtn');
            
            if (clearLogsBtn) {
                clearLogsBtn.addEventListener('click', function() {
                    document.getElementById('logBox').innerHTML = '<div style="color: #888;">Logs cleared...</div>';
                });
            }
            
            if (copyLogsBtn) {
                copyLogsBtn.addEventListener('click', function() {
                    const logBox = document.getElementById('logBox');
                    const logs = logBox.innerText;
                    navigator.clipboard.writeText(logs).then(function() {
                        addLog('Logs copied to clipboard!', 'success');
                    }).catch(function() {
                        addLog('Failed to copy logs', 'error');
                    });
                });
            }

            updateConnectionStatus('Ready to send', false);
        });
    </script>
</body>
</html>
        `);
    });



    // Individual message endpoint (for backward compatibility)
    app.post('/send-bulk-message', async (req, res) => {
        try {
            const { phone, message } = req.body;
            
            if (!phone || !message) {
                return res.status(400).json({ error: 'Phone number and message are required' });
            }

            // Format phone number for WhatsApp - handle international numbers
            let formattedPhone = phone.trim();
            
            // Remove common prefixes and format for WhatsApp
            if (formattedPhone.startsWith('+')) {
                // International format: +1234567890 -> 1234567890@c.us
                formattedPhone = formattedPhone.substring(1) + '@c.us';
            } else if (formattedPhone.startsWith('00')) {
                // International prefix: 001234567890 -> 1234567890@c.us
                formattedPhone = formattedPhone.substring(2) + '@c.us';
            } else if (formattedPhone.startsWith('0')) {
                // Local format: 01234567890 -> 1234567890@c.us
                formattedPhone = formattedPhone.substring(1) + '@c.us';
            } else {
                // Direct number: 1234567890 -> 1234567890@c.us
                formattedPhone = formattedPhone + '@c.us';
            }

            // Send message using WhatsApp client
            if (globalState.client && globalState.isAuthenticated) {
                await globalState.client.sendMessage(formattedPhone, message);
                
                logger.success('Message sent successfully', [
                    `Phone: ${phone}`,
                    `Formatted: ${formattedPhone}`,
                    `Message: ${message.substring(0, 50)}...`
                ]);
                
                res.json({ success: true, phone: phone, formatted: formattedPhone });
            } else {
                res.status(503).json({ error: 'WhatsApp client not ready' });
            }
            
        } catch (error) {
            logger.error('Error sending message', [error.message]);
            res.status(500).json({ error: 'Failed to send message', details: error.message });
        }
    });




    async function processBulkMessagesWithWebSocket(ws, phoneNumbers, message) {
        let successCount = 0;
        let failCount = 0;
        const totalCount = phoneNumbers.length;
        
        // Send initial log
        ws.send(JSON.stringify({
            type: 'bulk_log',
            message: 'Starting bulk messaging process...',
            logType: 'info'
        }));
        
        ws.send(JSON.stringify({
            type: 'bulk_log',
            message: 'Total numbers: ' + totalCount,
            logType: 'info'
        }));

        for (let i = 0; i < phoneNumbers.length; i++) {
            const phone = phoneNumbers[i];
            
            try {
                // Format phone number for WhatsApp - handle international numbers
                let formattedPhone = phone.trim();
                
                // Remove common prefixes and format for WhatsApp
                if (formattedPhone.startsWith('+')) {
                    formattedPhone = formattedPhone.substring(1) + '@c.us';
                } else if (formattedPhone.startsWith('00')) {
                    formattedPhone = formattedPhone.substring(2) + '@c.us';
                } else if (formattedPhone.startsWith('0')) {
                    formattedPhone = formattedPhone.substring(1) + '@c.us';
                } else {
                    formattedPhone = formattedPhone + '@c.us';
                }

                // Send log before sending
                ws.send(JSON.stringify({
                    type: 'bulk_log',
                    message: 'Sending to ' + phone + '...',
                    logType: 'info'
                }));

                // Send message
                await globalState.client.sendMessage(formattedPhone, message);
                successCount++;
                
                // Send success log
                ws.send(JSON.stringify({
                    type: 'bulk_log',
                    message: phone + ' sent successfully',
                    logType: 'success'
                }));

            } catch (error) {
                failCount++;
                
                // Send error log
                ws.send(JSON.stringify({
                    type: 'bulk_log',
                    message: 'Failed to send to ' + phone + ': ' + error.message,
                    logType: 'error'
                }));
            }

            // Send progress update
            ws.send(JSON.stringify({
                type: 'bulk_progress',
                total: totalCount,
                current: i + 1,
                success: successCount,
                failed: failCount,
                progress: Math.round(((i + 1) / totalCount) * 100)
            }));

            // Rate limiting - wait 1 second between messages
            if (i < totalCount - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Send completion message
        ws.send(JSON.stringify({
            type: 'bulk_complete',
            total: totalCount,
            success: successCount,
            failed: failCount
        }));

        // Send final log
        ws.send(JSON.stringify({
            type: 'bulk_log',
            message: 'Bulk messaging completed!',
            logType: 'success'
        }));

        ws.send(JSON.stringify({
            type: 'bulk_log',
            message: '📊 Final Results: ' + successCount + ' success, ' + failCount + ' failed',
            logType: 'info'
        }));
    }



    return app;
};

// Main application startup
const startApplication = async () => {
    try {
        logger.info('🚀 Starting WhatsApp Bot Application', [
            'Loading required modules...',
            'Setting up configuration...',
            'Initializing WhatsApp client...'
        ]);

        // Create WhatsApp client
        const client = createWhatsAppClient();
        globalState.client = client;

        // Setup event handlers
        setupEventHandlers(client);

        // Load real estate bot handlers
        logger.step(8, 'Loading Real Estate Bot Handlers', [
            'File: replays.js',
            'Purpose: Real estate bot logic',
            'Status: Loading...'
        ]);

        try {
            // Import the new replays.js file
            const replaysModule = await import('./replays.js');
            const registerMessageHandlers = replaysModule.default;
            
            if (typeof registerMessageHandlers === 'function') {
                const botStats = registerMessageHandlers(client);
                logger.success('Real estate bot handlers loaded successfully!', [
                    'Message handlers: Registered',
                    'Bot logic: Active',
                    'Features: Real estate assistance ready',
                    'Stats monitoring: Available',
                    'User data collection: Active'
                ]);
                
                // Store bot stats for potential dashboard display
                globalState.botStats = botStats;
                logger.info('Bot statistics monitoring enabled');
            } else {
                logger.warning('Real estate bot handlers not found in expected format');
            }
        } catch (error) {
            logger.error('Could not load real estate bot handlers', [
                error.message,
                'Check if replays.js exists and is properly formatted',
                'Bot will continue with basic Hello World functionality'
            ]);
        }

        // Start WhatsApp client
        logger.step(9, 'Starting WhatsApp Client', [
            'This will launch Puppeteer browser',
            'Browser will connect to WhatsApp Web',
            'QR code will be generated if needed'
        ]);

        await client.initialize();

        // Create and start Express server with WebSocket support
        const app = createExpressServer();
        const server = createServer(app);
        
        // Create WebSocket server
        const wss = new WebSocketServer({ server });
        
        // WebSocket connection handling
        wss.on('connection', (ws) => {
            logger.info('WebSocket client connected', [
                'Client: Browser bulk messaging page',
                'Status: Ready for real-time updates'
            ]);
            
            // Send initial connection status
            ws.send(JSON.stringify({
                type: 'connection_status',
                status: 'Connected',
                connected: true
            }));
            
            ws.on('message', async (data) => {
                try {
                    const message = JSON.parse(data);
                    
                    if (message.type === 'start_bulk_messaging') {
                        logger.info('WebSocket: Starting bulk messaging', [
                            `Phone numbers: ${message.phoneNumbers.length}`,
                            `Message: ${message.message.substring(0, 50)}...`
                        ]);
                        
                        // Send confirmation
                        ws.send(JSON.stringify({
                            type: 'bulk_log',
                            message: 'Bulk messaging started via WebSocket!',
                            logType: 'success'
                        }));
                        
                        // Start bulk messaging process
                        await processBulkMessagesWithWebSocket(ws, message.phoneNumbers, message.message);
                    }
                } catch (error) {
                    logger.error('WebSocket message error', [error.message]);
                    ws.send(JSON.stringify({
                        type: 'bulk_log',
                        message: '❌ Error processing message: ' + error.message,
                        logType: 'error'
                    }));
                }
            });
            
            ws.on('close', () => {
                logger.info('WebSocket client disconnected');
            });
            
            ws.on('error', (error) => {
                logger.error('WebSocket error', [error.message]);
            });
        });
        
        // Store WebSocket server in global state for bulk messaging updates
        globalState.wss = wss;
        
        server.listen(PORT, () => {
            logger.success('Server started successfully!', [
                `Port: ${PORT}`,
                'Status: Listening for HTTP and WebSocket requests',
                `Dashboard: http://localhost:${PORT}`,
                `WebSocket: ws://localhost:${PORT}`,
                'Purpose: Monitor bot status and handle bulk messaging'
            ]);
        });

        logger.success('🎯 System initialization complete!', [
            'WhatsApp client: Starting...',
            'Express server: Running',
            'Dashboard: Available',
            '⏳ Waiting for WhatsApp client to generate QR code...',
            'This may take 10-30 seconds',
            'Watch for "Step 2: QR Code Generated!" message'
        ]);

    } catch (error) {
        logger.error('Failed to start application', [
            `Error: ${error.message}`,
            'Check Puppeteer configuration',
            'Verify system dependencies'
        ]);
        process.exit(1);
    }
};

// Handle graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Shutting down gracefully...');
    
    // Clear heartbeat monitoring
    if (globalState.heartbeatInterval) {
        clearInterval(globalState.heartbeatInterval);
        logger.info('💓 Heartbeat monitoring cleared');
    }
    
    if (globalState.client) {
        await globalState.client.destroy();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Shutting down gracefully...');
    
    // Clear heartbeat monitoring
    if (globalState.heartbeatInterval) {
        clearInterval(globalState.heartbeatInterval);
        logger.info('💓 Heartbeat monitoring cleared');
    }
    
    if (globalState.client) {
        await globalState.client.destroy();
    }
    process.exit(0);
});

// Start the application
startApplication();

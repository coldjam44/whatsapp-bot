import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import PhoneDatabase from './database.js';
import MySQLDatabase from './mysql_database.js';

// Configuration constants
const PORT = 8046;
const TEST_NUMBER = "966504693227";

// Simple logger
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

// Initialize database
const phoneDB = new PhoneDatabase();
const mysqlDB = new MySQLDatabase();

// Connect to MySQL database
mysqlDB.connect().then(connected => {
    if (connected) {
        console.log('✅ MySQL database connected successfully');
    } else {
        console.log('⚠️ MySQL database connection failed, using JSON fallback');
    }
});

// Note: Session files are preserved - only QR code #3 will be displayed


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
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--disable-extensions',
                '--disable-plugins',
                '--disable-default-apps',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--memory-pressure-off',
                '--max_old_space_size=4096'
            ]
        }
    });
};

// QR code generation with extended duration
let qrCounter = 0;
let lastQRTime = 0;
const QR_DURATION_MS = 45000; // 45 seconds - longer duration for QR code

const generateQRCode = async (qr) => {
    qrCounter++;
    const currentTime = Date.now();
    
    try {
        if (globalState.isAuthenticated) {
            logger.success('Already authenticated, skipping QR code generation');
            return;
        }

        // Check if enough time has passed since last QR code (to make it last longer)
        if (globalState.currentQR && (currentTime - lastQRTime) < QR_DURATION_MS) {
            console.log(`⏳ QR code still valid for ${Math.round((QR_DURATION_MS - (currentTime - lastQRTime)) / 1000)} more seconds`);
            return;
        }

        logger.step(2, 'Generating QR Code', [
            'Event: QR code received from WhatsApp',
            'Status: Ready for user to scan',
            `Duration: ${QR_DURATION_MS / 1000} seconds`
        ]);

        // Generate terminal QR code
        qrcode.generate(qr, { small: true });
        logger.info('QR Code Generated', [
            'Action Required: Open WhatsApp on your phone',
            'Action Required: Go to Settings > Linked Devices',
            'Action Required: Tap "Link a Device"',
            'Action Required: Scan the QR code above',
            `QR Code #${qrCounter} - Valid for ${QR_DURATION_MS / 1000} seconds`
        ]);

        // Generate browser QR code
        const qrDataURL = await QRCode.toDataURL(qr, {
            width: 300,
            margin: 2,
            color: { dark: '#000000', light: '#FFFFFF' }
        });

        globalState.currentQR = qrDataURL;
        lastQRTime = currentTime;
        
        logger.success('QR code generated for browser display', [
            'Browser Dashboard: QR code is now visible',
            `Duration: ${QR_DURATION_MS / 1000} seconds before next refresh`,
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
                        // Check auth status and auto-initialize if needed
                        fetch('/api/auth-status')
                            .then(response => response.json())
                            .then(data => {
                                if (data.success && !data.isAuthenticated && !data.hasAuthFiles) {
                                    console.log('No auth files found, QR code should be generated');
                                }
                            })
                            .catch(error => console.log('Auth status check failed:', error));
                        
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
                            <a href="/spreadsheet" class="nav-link">📊 Spreadsheet</a>
                            <a href="/message-editor" class="nav-link">📝 Message Editor</a>
                            <a href="/template-manager" class="nav-link">⚙️ Template Manager</a>
                        </div>
                    </div>
                </nav>

                <div class="container">
                    <h1>🤖 WhatsApp Bot Dashboard</h1>
                    
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
                            <h3>📊 Contact Management & Messaging</h3>
                            <p>Manage your contacts and send messages using our integrated spreadsheet system</p>
                            <a href="/spreadsheet" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 15px 30px; border-radius: 8px; font-weight: bold; transition: all 0.3s ease;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                                🚀 Go to Spreadsheet
                            </a>
                        </div>
                        
                        <div class="qr-container" style="background-color: #f8d7da; border-color: #dc3545; margin-top: 20px;">
                            <h3>🚪 Logout</h3>
                            <p>Disconnect from WhatsApp and clear authentication</p>
                            <button onclick="logout()" style="background: #dc3545; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-weight: bold;">
                                🚪 Logout & Clear Session
                            </button>
                        </div>
                    ` : ''}
                </div>
            </body>
            <script>
                function logout() {
                    if (confirm('Are you sure you want to logout? This will disconnect from WhatsApp and clear the session.')) {
                        fetch('/logout', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            }
                        })
                        .then(response => response.json())
                        .then(data => {
                            if (data.success) {
                                // Redirect to logout animation page
                                window.location.href = data.redirect || '/logout.html';
                            } else {
                                alert('Error during logout: ' + data.error);
                            }
                        })
                        .catch(error => {
                            alert('Error during logout: ' + error.message);
                        });
                    }
                }
            </script>
            </html>
        `;

        res.send(html);
    });

    // Logout endpoint
    app.post('/logout', async (req, res) => {
        try {
            logger.info('Logout requested', ['User initiated logout process']);
            
            // Destroy the WhatsApp client session
            if (globalState.client) {
                try {
                    await globalState.client.destroy();
                    logger.info('WhatsApp client destroyed', ['Session terminated']);
                } catch (error) {
                    logger.warning('Error destroying client', [error.message]);
                }
            }
            
            // Clear global state
            globalState.client = null;
            globalState.isAuthenticated = false;
            globalState.userInfo = null;
            globalState.currentQR = null;
            
            // Remove authentication files
            const fs = await import('fs');
            const path = await import('path');
            
            const authDir = path.join(process.cwd(), '.wwebjs_auth');
            const cacheDir = path.join(process.cwd(), '.wwebjs_cache');
            
            try {
                if (fs.existsSync(authDir)) {
                    fs.rmSync(authDir, { recursive: true, force: true });
                    logger.info('Authentication directory removed', [authDir]);
                }
                if (fs.existsSync(cacheDir)) {
                    fs.rmSync(cacheDir, { recursive: true, force: true });
                    logger.info('Cache directory removed', [cacheDir]);
                }
            } catch (error) {
                logger.warning('Error removing auth/cache directories', [error.message]);
            }
            
            logger.success('Logout completed successfully', [
                'Session cleared',
                'Authentication files removed',
                'Client destroyed'
            ]);
            
            // Send JSON response first
            res.json({
                success: true,
                message: 'Logged out successfully. Redirecting to logout page...',
                redirect: '/logout.html'
            });
            
            // Restart the bot after a short delay
            setTimeout(() => {
                logger.info('Restarting bot after logout...');
                process.exit(0); // PM2 will automatically restart the process
            }, 2000);
            
        } catch (error) {
            logger.error('Error during logout', [error.message]);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Bulk messaging page route
    app.get("/blkmsg", (req, res) => {
        res.sendFile('test.html', { root: 'public' });
    });

    // Logout animation page route
    app.get("/logout.html", (req, res) => {
        res.sendFile('logout.html', { root: 'public' });
    });

    // Spreadsheet page route
    app.get("/spreadsheet", (req, res) => {
        res.sendFile('spreadsheet.html', { root: 'public' });
    });

    // Message Editor page route
    app.get("/message-editor", (req, res) => {
        res.sendFile('message-editor.html', { root: 'public' });
    });

    // Template Manager page route
    app.get("/template-manager", (req, res) => {
        res.sendFile('template-manager.html', { root: 'public' });
    });

    // Test WhatsApp library access endpoint
    app.post('/test-whatsapp', async (req, res) => {
        try {
            const { phoneNumbers, message } = req.body;
            let numbersToTest = phoneNumbers || ['+966504693227']; // Default to single number if none provided
            
            // No limit on numbers - rate limiting will be handled by delays
            logger.info('Processing WhatsApp messages', [
                `Total numbers: ${numbersToTest.length}`,
                `Rate limiting: 30 seconds between messages`
            ]);
            
            logger.info('Testing WhatsApp library access and sending test messages', [
                `Numbers to test: ${numbersToTest.length}`,
                `Numbers: ${numbersToTest.join(', ')}`
            ]);
            
            // Check if client exists
            if (!globalState.client) {
                return res.json({
                    success: false,
                    error: 'Client not initialized',
                    message: 'WhatsApp client is not available'
                });
            }

            // Check client state
            const clientReady = globalState.client.info ? true : false;
            const authenticated = globalState.isAuthenticated;
            
            // Get user info if available
            let userInfo = 'Not available';
            if (globalState.client.info) {
                userInfo = `${globalState.client.info.pushname} (${globalState.client.info.wid.user})`;
            }

            // Test if we can access the sendMessage function
            const hasSendMessage = typeof globalState.client.sendMessage === 'function';
            
            let messageResults = [];
            let messageStatus = 'Not attempted';
            
            // If client is ready and authenticated, try to send test messages
            if (clientReady && authenticated && hasSendMessage) {
                // Use custom message or fallback to default
                let testMessage = message;
                if (!testMessage || testMessage.trim().length === 0) {
                    testMessage = `🤖 Test Message from WhatsApp Bot
📅 Time: ${new Date().toLocaleString()}
🔢 Random Code: ${Math.floor(Math.random() * 900000) + 100000}
✅ This is a test message to verify the bot is working!`;
                } else {
                    // Replace placeholders in custom message
                    testMessage = testMessage
                        .replace(/\[current time\]/gi, new Date().toLocaleString())
                        .replace(/\[random number\]/gi, Math.floor(Math.random() * 900000) + 100000);
                }
                
                logger.info('Attempting to send test messages', [
                    `To: ${numbersToTest.join(', ')}`,
                    `Message length: ${testMessage.length} characters`
                ]);
                
                // Send message to each phone number with rate limiting
                for (let i = 0; i < numbersToTest.length; i++) {
                    const phoneNumber = numbersToTest[i];
                    try {
                        const chatId = phoneNumber.replace('+', '') + '@c.us';
                        const result = await globalState.client.sendMessage(chatId, testMessage);
                        
                        messageResults.push({
                            phoneNumber: phoneNumber,
                            success: true,
                            messageId: result.id._serialized,
                            timestamp: result.timestamp,
                            status: 'Message sent successfully'
                        });
                        
                        logger.success('Test message sent successfully', [
                            `To: ${phoneNumber}`,
                            `Message ID: ${result.id._serialized}`,
                            `Timestamp: ${result.timestamp}`,
                            `Status: Message delivered to WhatsApp`
                        ]);
                        
                        // Rate limiting: 30 seconds delay between messages to prevent ban
                        if (i < numbersToTest.length - 1) { // Don't delay after the last message
                            const delay = 30000; // 30 seconds
                            logger.info('Rate limiting delay', [
                                `Waiting ${delay/1000} seconds before next message...`,
                                `Progress: ${i + 1}/${numbersToTest.length} messages sent`,
                                `Remaining: ${numbersToTest.length - i - 1} messages`
                            ]);
                            await new Promise(resolve => setTimeout(resolve, delay));
                        }
                        
                    } catch (messageError) {
                        messageResults.push({
                            phoneNumber: phoneNumber,
                            success: false,
                            error: messageError.message,
                            status: 'Failed to send message'
                        });
                        
                        logger.error('Test message failed', [
                            `Error: ${messageError.message}`,
                            `To: ${phoneNumber}`
                        ]);
                        
                        // Even on error, add delay to avoid rapid retries
                        if (i < numbersToTest.length - 1) {
                            const delay = Math.floor(Math.random() * 1000) + 2000; // 2-3 seconds
                            await new Promise(resolve => setTimeout(resolve, delay));
                        }
                    }
                }
                
                const successCount = messageResults.filter(r => r.success).length;
                const failCount = messageResults.filter(r => !r.success).length;
                messageStatus = `Sent to ${successCount}/${numbersToTest.length} numbers (${failCount} failed)`;
                
            } else {
                messageStatus = 'Cannot send messages - client not ready or not authenticated';
            }
            
            logger.success('WhatsApp library access test completed', [
                `Client Ready: ${clientReady}`,
                `Authenticated: ${authenticated}`,
                `Has sendMessage: ${hasSendMessage}`,
                `User: ${userInfo}`,
                `Message Status: ${messageStatus}`
            ]);

            res.json({
                success: true,
                status: 'WhatsApp library test completed',
                clientReady: clientReady,
                authenticated: authenticated,
                hasSendMessage: hasSendMessage,
                userInfo: userInfo,
                messageStatus: messageStatus,
                messageResults: messageResults,
                message: 'WhatsApp library test completed - check message results for details'
            });

        } catch (error) {
            logger.error('WhatsApp library access test failed', [error.message]);
            
            res.json({
                success: false,
                error: error.message,
                message: 'Failed to access WhatsApp library functions'
            });
        }
    });

    // Check message delivery status endpoint
    app.get('/check-messages', async (req, res) => {
        try {
            if (!globalState.client || !globalState.isAuthenticated) {
                return res.json({
                    success: false,
                    message: 'WhatsApp client not ready'
                });
            }

            // Get recent chats to see message status
            const chats = await globalState.client.getChats();
            const recentChats = chats.slice(0, 10); // Get last 10 chats
            
            const chatInfo = recentChats.map(chat => ({
                name: chat.name || chat.id.user,
                phoneNumber: chat.id.user,
                lastMessage: chat.lastMessage ? {
                    body: chat.lastMessage.body,
                    timestamp: chat.lastMessage.timestamp,
                    fromMe: chat.lastMessage.fromMe
                } : null,
                unreadCount: chat.unreadCount
            }));

            res.json({
                success: true,
                recentChats: chatInfo,
                message: 'Recent chat information retrieved'
            });

        } catch (error) {
            logger.error('Failed to check messages', [error.message]);
            res.json({
                success: false,
                error: error.message,
                message: 'Failed to retrieve chat information'
            });
        }
    });

    // Phone number management endpoints
    app.post('/api/contacts', async (req, res) => {
        try {
            const { phone, name, source, notes } = req.body;
            const result = await mysqlDB.addContact(phone, name, source, notes);
            res.json(result);
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.post('/api/contacts/bulk', async (req, res) => {
        try {
            const { contacts } = req.body;
            const results = await mysqlDB.addContacts(contacts);
            res.json({ success: true, results });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.put('/api/contacts/update', async (req, res) => {
        try {
            const { phone, name, source, notes } = req.body;
            const result = await mysqlDB.updateContact(phone, name, source, notes);
            res.json(result);
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.get('/api/contacts', async (req, res) => {
        try {
            const { limit = 100, source } = req.query;
            const result = await mysqlDB.getContacts(limit, source);
            res.json(result);
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.get('/api/contacts/export', (req, res) => {
        try {
            const contacts = phoneDB.getContacts();
            const csv = 'Phone,Name,Source,Added At\n' + 
                contacts.map(c => `${c.phone},${c.name},${c.source},${c.addedAt}`).join('\n');
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=contacts.csv');
            res.send(csv);
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    // Delete contact endpoint
    app.post('/api/contacts/delete', async (req, res) => {
        try {
            const phone = req.body.phone;
            
            if (!phone) {
                return res.json({ success: false, error: 'Phone number is required' });
            }
            
            const result = await mysqlDB.deleteContact(phone);
            
            if (result.success) {
                // Redirect back to spreadsheet page with success message
                res.redirect('/spreadsheet?deleted=' + encodeURIComponent(phone));
            } else {
                // Redirect back with error message
                res.redirect('/spreadsheet?error=' + encodeURIComponent(result.message));
            }
        } catch (error) {
            res.redirect('/spreadsheet?error=' + encodeURIComponent(error.message));
        }
    });

    // Send message endpoint for spreadsheet
    app.post('/api/send-message', async (req, res) => {
        try {
            const { phone, message } = req.body;
            
            if (!phone || !message) {
                return res.json({ success: false, error: 'Phone number and message are required' });
            }

            // Format phone number for WhatsApp - handle international numbers
            let formattedPhone = phone.trim();
            
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

            // Check if WhatsApp client is ready and authenticated
            if (!globalState.client || !globalState.isAuthenticated) {
                return res.json({ success: false, error: 'WhatsApp client is not ready or not authenticated' });
            }

            // Send the message
            await globalState.client.sendMessage(formattedPhone, message);
            
            // Database update disabled - no longer updating contact stats

            res.json({ success: true, message: 'Message sent successfully' });
            
        } catch (error) {
            console.error('Error sending message:', error);
            res.json({ success: false, error: error.message });
        }
    });

    // Serve template file
    app.get('/template.xlsx', (req, res) => {
        const path = require('path');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="contacts_template.xlsx"');
        res.sendFile(path.join(process.cwd(), 'public', 'template.xlsx'));
    });

    // Upload template endpoint
    app.post('/api/upload-template', async (req, res) => {
        try {
            const multer = await import('multer');
            const XLSX = await import('xlsx');
            
            // Configure multer for file upload
            const upload = multer.default({
                storage: multer.default.memoryStorage(),
                fileFilter: (req, file, cb) => {
                    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
                        file.mimetype === 'text/csv') {
                        cb(null, true);
                    } else {
                        cb(new Error('Only Excel (.xlsx) and CSV files are allowed'), false);
                    }
                }
            });
            
            upload.single('template')(req, res, async (err) => {
                if (err) {
                    return res.json({ success: false, error: err.message });
                }
                
                if (!req.file) {
                    return res.json({ success: false, error: 'No file uploaded' });
                }
                
                try {
                    let workbook;
                    let worksheet;
                    
                    if (req.file.mimetype === 'text/csv') {
                        // Handle CSV file
                        const csvData = req.file.buffer.toString('utf8');
                        workbook = XLSX.default.read(csvData, { type: 'string' });
                    } else {
                        // Handle Excel file
                        workbook = XLSX.default.read(req.file.buffer, { type: 'buffer' });
                    }
                    
                    // Get the first worksheet
                    const sheetName = workbook.SheetNames[0];
                    worksheet = workbook.Sheets[sheetName];
                    
                    // Convert to JSON
                    const jsonData = XLSX.default.utils.sheet_to_json(worksheet);
                    
                    if (jsonData.length === 0) {
                        return res.json({ success: false, error: 'No data found in the file' });
                    }
                    
                    // Process and save contacts
                    const contacts = jsonData.map(row => ({
                        phone: String(row.Phone || row.phone || '').trim(),
                        name: String(row.Name || row.name || '').trim(),
                        source: String(row.Source || row.source || 'Template Upload').trim(),
                        notes: String(row.Notes || row.notes || '').trim()
                    })).filter(contact => contact.phone); // Only include contacts with phone numbers
                    
                    if (contacts.length === 0) {
                        return res.json({ success: false, error: 'No valid contacts found (phone numbers required)' });
                    }
                    
                    // Save contacts to database
                    const results = await mysqlDB.addContacts(contacts);
                    const successCount = results.filter(r => r.success).length;
                    
                    res.json({
                        success: true,
                        count: successCount,
                        total: contacts.length,
                        message: `Successfully imported ${successCount} out of ${contacts.length} contacts`
                    });
                    
                } catch (error) {
                    console.error('Error processing uploaded file:', error);
                    res.json({ success: false, error: 'Error processing file: ' + error.message });
                }
            });
            
        } catch (error) {
            console.error('Upload error:', error);
            res.json({ success: false, error: error.message });
        }
    });

    // Check auth status and auto-initialize if needed
    app.get('/api/auth-status', async (req, res) => {
        try {
            const hasAuthFiles = await checkAuthFiles();
            
            // If no auth files and no client, initialize WhatsApp
            if (!hasAuthFiles && !globalState.client) {
                logger.info('🔄 Auto-initializing WhatsApp client (no auth files found)');
                
                // Create new client
                const client = createWhatsAppClient();
                globalState.client = client;
                
                // Setup event handlers
                setupEventHandlers(client);
                
                // Start the client (this will generate QR code)
                await client.initialize();
                
                logger.success('WhatsApp client initialized', ['QR code should be generated']);
            }
            
            res.json({
                success: true,
                hasAuthFiles: hasAuthFiles,
                isAuthenticated: globalState.isAuthenticated,
                hasClient: !!globalState.client,
                currentQR: globalState.currentQR
            });
        } catch (error) {
            logger.error('Error in auth status check', [error.message]);
            res.json({
                success: false,
                error: error.message
            });
        }
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







    // Template management API endpoints
    app.post('/api/templates/save', async (req, res) => {
        try {
            const { templateName, templateData } = req.body;
            
            if (!templateName || !templateData) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Template name and data are required' 
                });
            }

            const result = await mysqlDB.saveTemplate(templateName, templateData);
            
            if (result.success) {
                logger.success('Template saved successfully', [
                    `Name: ${templateName}`,
                    `Languages: ${Object.keys(templateData).join(', ')}`
                ]);
            }
            
            res.json(result);
        } catch (error) {
            logger.error('Error saving template', [error.message]);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to save template',
                details: error.message 
            });
        }
    });

    app.get('/api/templates/active', async (req, res) => {
        try {
            const result = await mysqlDB.getActiveTemplate();
            
            if (result.success) {
                logger.info('Active template retrieved successfully', [
                    `Active Template: ${result.template.name}`
                ]);
            }
            
            res.json(result);
        } catch (error) {
            logger.error('Error getting active template', [error.message]);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to get active template',
                details: error.message 
            });
        }
    });

    app.get('/api/templates/:templateName', async (req, res) => {
        try {
            const { templateName } = req.params;
            const result = await mysqlDB.getTemplate(templateName);
            
            if (result.success) {
                logger.info('Template retrieved successfully', [
                    `Name: ${templateName}`,
                    `Updated: ${result.template.updated_at}`
                ]);
            }
            
            res.json(result);
        } catch (error) {
            logger.error('Error getting template', [error.message]);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to get template',
                details: error.message 
            });
        }
    });

    app.get('/api/templates', async (req, res) => {
        try {
            const result = await mysqlDB.getAllTemplates();
            
            if (result.success) {
                logger.info('All templates retrieved successfully', [
                    `Count: ${result.templates.length}`
                ]);
            }
            
            res.json(result);
        } catch (error) {
            logger.error('Error getting all templates', [error.message]);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to get templates',
                details: error.message 
            });
        }
    });

    app.delete('/api/templates/:templateName', async (req, res) => {
        try {
            const { templateName } = req.params;
            const result = await mysqlDB.deleteTemplate(templateName);
            
            if (result.success) {
                logger.success('Template deleted successfully', [
                    `Name: ${templateName}`
                ]);
            }
            
            res.json(result);
        } catch (error) {
            logger.error('Error deleting template', [error.message]);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to delete template',
                details: error.message 
            });
        }
    });

    app.post('/api/templates/set-active', async (req, res) => {
        try {
            const { templateName } = req.body;
            
            if (!templateName) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Template name is required' 
                });
            }

            const result = await mysqlDB.setActiveTemplate(templateName);
            
            if (result.success) {
                logger.success('Active template set successfully', [
                    `Active Template: ${templateName}`
                ]);
            }
            
            res.json(result);
        } catch (error) {
            logger.error('Error setting active template', [error.message]);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to set active template',
                details: error.message 
            });
        }
    });

    app.post('/api/templates/reload', async (req, res) => {
        try {
            if (globalState.botStats && globalState.botStats.reloadActiveTemplate) {
                await globalState.botStats.reloadActiveTemplate();
                logger.success('Active template reloaded successfully');
                res.json({ 
                    success: true, 
                    message: 'Active template reloaded successfully' 
                });
            } else {
                res.status(503).json({ 
                    success: false, 
                    error: 'Bot handlers not available' 
                });
            }
        } catch (error) {
            logger.error('Error reloading active template', [error.message]);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to reload active template',
                details: error.message 
            });
        }
    });

    // Bot status endpoint
    app.get('/api/bot/status', async (req, res) => {
        try {
            const isReady = globalState.botStats && globalState.botStats.getUserStats;
            res.json({ 
                success: true, 
                ready: isReady,
                message: isReady ? 'Bot is ready' : 'Bot is not ready yet'
            });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                ready: false,
                error: 'Failed to check bot status',
                details: error.message 
            });
        }
    });

    // Reset user states endpoint
    app.post('/api/templates/reset-users', async (req, res) => {
        try {
            if (globalState.botStats && globalState.botStats.forceResetUsers) {
                globalState.botStats.forceResetUsers();
                logger.success('User states force reset successfully');
                res.json({ 
                    success: true, 
                    message: 'User states reset successfully' 
                });
            } else {
                res.status(503).json({ 
                    success: false, 
                    error: 'Bot handlers not available' 
                });
            }
        } catch (error) {
            logger.error('Error resetting user states', [error.message]);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to reset user states',
                details: error.message 
            });
        }
    });

    return app;
};

// Main application startup
// Check if auth files exist
const checkAuthFiles = async () => {
    const fs = await import('fs');
    const path = await import('path');
    
    const authDir = path.join(process.cwd(), '.wwebjs_auth');
    return fs.existsSync(authDir);
};

const startApplication = async () => {
    try {
        logger.info('🚀 Starting WhatsApp Bot Application', [
            'Loading required modules...',
            'Setting up configuration...',
            'Checking authentication status...'
        ]);

        // Check if auth files exist
        const hasAuthFiles = await checkAuthFiles();
        
        if (hasAuthFiles) {
            logger.info('🔐 Authentication files found', ['Client will attempt to restore session']);
        } else {
            logger.info('🔓 No authentication files found', ['QR code will be generated for new login']);
        }

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
                globalState.botStats = botStats;
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
                        
                        // Bulk messaging functionality removed
                        ws.send(JSON.stringify({
                            type: 'bulk_log',
                            message: 'Bulk messaging functionality has been removed',
                            logType: 'error'
                        }));
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

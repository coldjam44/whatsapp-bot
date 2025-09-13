// replays.js - Fire Message Response Handler
import MySQLDatabase from './mysql_database.js';

export default function registerMessageHandlers(client) {
    console.log('🚀 REPLAYS.JS LOADED - Starting message handler registration...');
    
    // User states management
    let userStates = {};
    let userData = [];
    let completedUsers = [];
  
    // Initialize database connection
    const mysqlDB = new MySQLDatabase();
    mysqlDB.connect();
  
    // Regex for numbers (Arabic + English) - more flexible
    const numberRegex = /^[0-9\u0660-\u0669]+$/;
    
    // Function to normalize numbers (convert Arabic to English)
    const normalizeNumber = (text) => {
        return text
            .replace(/\u0660/g, '0')
            .replace(/\u0661/g, '1')
            .replace(/\u0662/g, '2')
            .replace(/\u0663/g, '3')
            .replace(/\u0664/g, '4')
            .replace(/\u0665/g, '5')
            .replace(/\u0666/g, '6')
            .replace(/\u0667/g, '7')
            .replace(/\u0668/g, '8')
            .replace(/\u0669/g, '9');
    };
  
    // Load active template from database
    let activeTemplate = null;
    
    async function loadActiveTemplate() {
        try {
            console.log('🔧 Calling mysqlDB.getActiveTemplate()...');
            const result = await mysqlDB.getActiveTemplate();
            console.log('🔧 getActiveTemplate result:', result);
            if (result.success) {
                activeTemplate = result.template.data;
                console.log(`✅ Loaded active template: ${result.template.name}`);
            } else {
                console.log('⚠️ No active template found, using default');
                // Use default template if none is active
                activeTemplate = getDefaultTemplate();
            }
        } catch (error) {
            console.error('❌ Error loading active template:', error);
            activeTemplate = getDefaultTemplate();
        }
    }
    
    function getDefaultTemplate() {
        return {
            ar: {
                chooseLang: "أهلاً بك 🌟\nرجاء اختر اللغة:\n1 - العربية 🇸🇦\n2 - English 🇬🇧\n\nWelcome 🌟\nPlease choose language:\n1 - العربية 🇸🇦\n2 - English 🇬🇧",
                yesResponse: "شكراً لردك 🙏\nحتى نساعدك بشكل أفضل، ممكن تشاركنا تفاصيل العقار\n(الموقع، نوع العقار، والسعر المتوقع).\n\nاطمئن، لن يتم الاتصال بك هاتفياً،\nوسيكون التواصل حصراً عبر الواتساب وبالوقت الذي يناسبك.\n\nأرسل 1 لإرسال تفاصيل العقار",
                noResponse: "ممتاز، شكراً لتوضيحك 🌿\nإذا أحببت، يمكننا أن نرسل لك من وقت لآخر المشاريع الجديدة\nوالفرص العقارية المناسبة عبر الواتساب فقط.\n\nلن يتم أي تواصل عبر مكالمات،\nوالقرار دائماً بيدك إن رغبت بالمتابعة أو التوقف.\n\nأرسل 1 للموافقة على التحديثات\nأرسل 2 للرفض",
                askDetails: "ممتاز! يرجى إرسال تفاصيل العقار:\n- الموقع\n- نوع العقار (فيلا، شقة، أرض، إلخ)\n- المساحة\n- السعر المتوقع\n- أي تفاصيل إضافية",
                updatesConfirmed: "شكراً لك! تم تسجيلك في قائمة التحديثات 📋\nستصلك العروض الجديدة والفرص العقارية عبر الواتساب فقط",
                updatesDeclined: "لا مشكلة، شكراً لك! 🙏\nإذا غيرت رأيك في المستقبل، يمكنك التواصل معنا",
                thank: "شكراً لك 🌹\nتم تسجيل معلوماتك وسيتم التواصل معك قريباً",
                invalid: "الرجاء إرسال رقم صحيح (1 أو 2)",
                invalidLang: "الرجاء إرسال 1 للعربية أو 2 للإنجليزية"
            },
            en: {
                chooseLang: "Welcome 🌟\nPlease choose language:\n1 - العربية 🇸🇦\n2 - English 🇬🇧\n\nأهلاً بك 🌟\nرجاء اختر اللغة:\n1 - العربية 🇸🇦\n2 - English 🇬🇧",
                yesResponse: "Thank you for your reply 🙏\nTo help you better, please share a few details about your property\n(location, type, and expected price).\n\nRest assured, we will not call you by phone.\nAll communication will remain through WhatsApp, at a time convenient for you.\n\nSend 1 to send property details",
                noResponse: "Thank you for clarifying 🌿\nIf you'd like, we can share with you from time to time the latest projects\nand property opportunities through WhatsApp only.\n\nNo calls, no interruptions — you decide if and when to continue.\n\nSend 1 to receive updates\nSend 2 to decline",
                askDetails: "Excellent! Please send property details:\n- Location\n- Property type (villa, apartment, land, etc.)\n- Area\n- Expected price\n- Any additional details",
                updatesConfirmed: "Thank you! You've been added to our updates list 📋\nYou'll receive new offers and property opportunities via WhatsApp only",
                updatesDeclined: "No problem, thank you! 🙏\nIf you change your mind in the future, feel free to contact us",
                thank: "Thank you 🌹\nYour information has been recorded and we'll contact you soon",
                invalid: "Please send a valid number (1 or 2)",
                invalidLang: "Please send 1 for Arabic or 2 for English"
            }
        };
    }
    
    // Load active template on startup
    console.log('🔧 Loading active template...');
    loadActiveTemplate().then(() => {
        console.log('✅ Active template loaded successfully');
    }).catch((error) => {
        console.error('❌ Error loading active template:', error);
    });
    
    console.log('🔧 Continuing execution after template loading...');
    
    // Helper function to get current template
    function getCurrentTemplate() {
        return activeTemplate || getDefaultTemplate();
    }
    
    // Function to reload active template (can be called periodically)
    async function reloadActiveTemplate() {
        const oldTemplate = activeTemplate;
        const oldTemplateName = oldTemplate ? 'previous' : 'none';
        
        await loadActiveTemplate();
        
        const newTemplateName = activeTemplate ? 'current' : 'none';
        
        console.log(`🔧 Template reload: ${oldTemplateName} -> ${newTemplateName}`);
        
        // Always reset user states when template is reloaded to ensure fresh conversations
        console.log('🔄 Template reloaded, resetting all user states for fresh conversations...');
        userStates = {};
        completedUsers = [];
        userData = [];
        console.log('✅ All user states reset - users can start new conversations');
    }
    
    // Reload template every 5 minutes to pick up changes
    setInterval(async () => {
        await reloadActiveTemplate();
    }, 5 * 60 * 1000); // 5 minutes
    
    // Language-specific texts/templates (fallback)
    const texts = {
        ar: {
            // Language selection
            chooseLang: "أهلاً بك 🌟\nرجاء اختر اللغة:\n1 - العربية 🇸🇦\n2 - English 🇬🇧\n\nWelcome 🌟\nPlease choose language:\n1 - العربية 🇸🇦\n2 - English 🇬🇧",
            
            // Yes response (has property)
            yesResponse: "شكراً لردك 🙏\nحتى نساعدك بشكل أفضل، ممكن تشاركنا تفاصيل العقار\n(الموقع، نوع العقار، والسعر المتوقع).\n\nاطمئن، لن يتم الاتصال بك هاتفياً،\nوسيكون التواصل حصراً عبر الواتساب وبالوقت الذي يناسبك.\n\nأرسل 1 لإرسال تفاصيل العقار",
            
            // No response (no property)
            noResponse: "ممتاز، شكراً لتوضيحك 🌿\nإذا أحببت، يمكننا أن نرسل لك من وقت لآخر المشاريع الجديدة\nوالفرص العقارية المناسبة عبر الواتساب فقط.\n\nلن يتم أي تواصل عبر مكالمات،\nوالقرار دائماً بيدك إن رغبت بالمتابعة أو التوقف.\n\nأرسل 1 للموافقة على التحديثات\nأرسل 2 للرفض",
            
            // Property details request
            askPropertyDetails: "ممتاز! يرجى إرسال تفاصيل العقار:\n- الموقع\n- نوع العقار (فيلا، شقة، أرض، إلخ)\n- المساحة\n- السعر المتوقع\n- أي تفاصيل إضافية",
            
            // Updates confirmation
            updatesConfirmed: "شكراً لك! تم تسجيلك في قائمة التحديثات 📋\nستصلك العروض الجديدة والفرص العقارية عبر الواتساب فقط",
            
            // Updates declined
            updatesDeclined: "لا مشكلة، شكراً لك! 🙏\nإذا غيرت رأيك في المستقبل، يمكنك التواصل معنا",
            
            // Thank you
            thank: "شكراً لك 🌹\nتم تسجيل معلوماتك وسيتم التواصل معك قريباً",
            
            // Invalid input
            invalid: "الرجاء إرسال رقم صحيح (1 أو 2)",
            invalidLang: "الرجاء إرسال 1 للعربية أو 2 للإنجليزية"
        },
        en: {
            // Language selection
            chooseLang: "Welcome 🌟\nPlease choose language:\n1 - العربية 🇸🇦\n2 - English 🇬🇧\n\nأهلاً بك 🌟\nرجاء اختر اللغة:\n1 - العربية 🇸🇦\n2 - English 🇬🇧",
            
            // Yes response (has property)
            yesResponse: "Thank you for your reply 🙏\nTo help you better, please share a few details about your property\n(location, type, and expected price).\n\nRest assured, we will not call you by phone.\nAll communication will remain through WhatsApp, at a time convenient for you.\n\nSend 1 to send property details",
            
            // No response (no property)
            noResponse: "Thank you for clarifying 🌿\nIf you'd like, we can share with you from time to time the latest projects\nand property opportunities through WhatsApp only.\n\nNo calls, no interruptions — you decide if and when to continue.\n\nSend 1 to receive updates\nSend 2 to decline",
            
            // Property details request
            askPropertyDetails: "Excellent! Please send property details:\n- Location\n- Property type (villa, apartment, land, etc.)\n- Area\n- Expected price\n- Any additional details",
            
            // Updates confirmation
            updatesConfirmed: "Thank you! You've been added to our updates list 📋\nYou'll receive new offers and property opportunities via WhatsApp only",
            
            // Updates declined
            updatesDeclined: "No problem, thank you! 🙏\nIf you change your mind in the future, you can contact us",
            
            // Thank you
            thank: "Thank you 🌹\nYour information has been registered and we will contact you soon",
            
            // Invalid input
            invalid: "Please send a valid number (1 or 2)",
            invalidLang: "Please send 1 for Arabic or 2 for English"
        }
    };


    // Main message handler
    console.log('🔧 Registering message handler...');
    console.log('🔧 Client state at registration:', {
        isReady: client.info ? true : false,
        hasInfo: !!client.info,
        pushname: client.info?.pushname || 'NO INFO'
    });
    
    // Check if client is ready
    if (!client.info) {
        console.log('⚠️ Client not ready yet, waiting for ready event...');
        client.once('ready', () => {
            console.log('🔧 Client is now ready, registering message handler...');
            registerMessageHandler();
        });
        return;
    }
    
    function registerMessageHandler() {
        try {
    client.on('message', async (message) => {
        try {
            console.log('🔔 MESSAGE RECEIVED!', {
                from: message.from,
                body: message.body,
                type: message.type,
                timestamp: new Date().toISOString()
            });
            
            // Ignore group messages
            if (message.from.endsWith('@g.us')) {
                console.log('⛔ Ignoring group message from:', message.from);
                return;
            }

            const from = message.from;
            const text = message.body.trim();

            // Skip if user already completed
            if (completedUsers.includes(from)) {
                console.log('✅ User already completed:', from);
                return;
            }
            
            console.log(`🔍 Completed users list:`, completedUsers);
            console.log(`🔍 User ${from} in completed list: ${completedUsers.includes(from)}`);

            console.log(`📱 Processing message from ${from}: "${text}"`);

            // Check if this is a response to fire message (1 or 2) - accept both Arabic and English numbers
            const normalizedText = normalizeNumber(text);
            console.log(`🔍 Normalized text: "${normalizedText}"`);
            console.log(`🔍 User state exists: ${!!userStates[from]}`);
            console.log(`🔍 Is fire response (1 or 2): ${normalizedText === '1' || normalizedText === '2'}`);
            
            if (!userStates[from] && (normalizedText === '1' || normalizedText === '2')) {
                userStates[from] = { 
                    step: 'CHOOSE_LANG',
                    fireResponse: normalizedText // Store the normalized fire message response
                };
                console.log(`🔥 User ${from} responded to fire message with: ${text} (normalized: ${normalizedText})`);
                
                return await message.reply(getCurrentTemplate().ar.chooseLang);
            }

            // If no state and not a fire message response, ignore
            if (!userStates[from]) {
                console.log(`⏭️ User ${from} sent message but not a fire response, ignoring: "${text}"`);
                console.log(`🔍 User state:`, userStates[from]);
                console.log(`🔍 All user states:`, Object.keys(userStates));
                return;
            }

            // Language selection - accept both Arabic and English numbers
            if (userStates[from].step === 'CHOOSE_LANG') {
                const normalizedText = normalizeNumber(text);
                if (numberRegex.test(text)) {
                    if (normalizedText === '1') {
                        userStates[from].lang = 'ar';
                        userStates[from].step = 'PROCESS_FIRE_RESPONSE';
                        console.log(`🇸🇦 User ${from} chose Arabic (${text} -> ${normalizedText})`);
                    } else if (normalizedText === '2') {
                        userStates[from].lang = 'en';
                        userStates[from].step = 'PROCESS_FIRE_RESPONSE';
                        console.log(`🇬🇧 User ${from} chose English (${text} -> ${normalizedText})`);
                    } else {
                        console.log(`❌ User ${from} entered invalid language choice: "${text}" (normalized: ${normalizedText})`);
                        return await message.reply(getCurrentTemplate().ar.invalidLang);
                    }
                    
                    // Process the fire message response
                    const fireResponse = userStates[from].fireResponse;
                    const lang = userStates[from].lang;
                    
                    if (fireResponse === '1' || fireResponse === '١') {
                        // User said YES (has property)
                        userStates[from].step = 'WAIT_PROPERTY_DETAILS';
                        console.log(`✅ User ${from} has property, asking for details in ${lang}`);
                        return await message.reply(getCurrentTemplate()[lang].yesResponse);
                    } else {
                        // User said NO (no property)
                        userStates[from].step = 'WAIT_UPDATE_CHOICE';
                        console.log(`❌ User ${from} has no property, asking about updates in ${lang}`);
                        return await message.reply(getCurrentTemplate()[lang].noResponse);
                    }
                } else {
                    console.log(`❌ User ${from} entered invalid input for language: "${text}"`);
                    return await message.reply(getCurrentTemplate().ar.invalidLang);
                }
            }

            // Get current language
            const lang = userStates[from].lang;

            // Wait for property details - accept both Arabic and English numbers
            if (userStates[from].step === 'WAIT_PROPERTY_DETAILS') {
                const normalizedText = normalizeNumber(text);
                if (normalizedText === '1') {
                    userStates[from].step = 'COLLECT_PROPERTY_DETAILS';
                    console.log(`📝 User ${from} ready to send property details in ${lang} (${text} -> ${normalizedText})`);
                    return await message.reply(getCurrentTemplate()[lang].askDetails);
                    } else {
                    console.log(`❌ User ${from} invalid input in WAIT_PROPERTY_DETAILS: "${text}" (normalized: ${normalizedText})`);
                    return await message.reply(getCurrentTemplate()[lang].invalid);
                }
            }

            // Collect property details
            if (userStates[from].step === 'COLLECT_PROPERTY_DETAILS') {
                // Store user data with property details
                const userDataEntry = {
                    from,
                    lang,
                    response: 'yes',
                    propertyDetails: text,
                    timestamp: new Date().toISOString()
                };
                
                userData.push(userDataEntry);
                completedUsers.push(from);
                
                console.log(`✅ User ${from} completed with property details:`, userDataEntry);
                console.log(`📊 Total completed users: ${completedUsers.length}`);
                
                // Clean up user state
                delete userStates[from];
                
                return await message.reply(getCurrentTemplate()[lang].thank);
            }

            // Wait for update choice - accept both Arabic and English numbers
            if (userStates[from].step === 'WAIT_UPDATE_CHOICE') {
                const normalizedText = normalizeNumber(text);
                if (normalizedText === '1') {
                    // User wants updates
                    const userDataEntry = {
                        from,
                        lang,
                        response: 'no',
                        wantsUpdates: true,
                        timestamp: new Date().toISOString()
                    };
                    
                    userData.push(userDataEntry);
                    completedUsers.push(from);
                    
                    console.log(`✅ User ${from} wants updates (${text} -> ${normalizedText}):`, userDataEntry);
                    console.log(`📊 Total completed users: ${completedUsers.length}`);
                    
                    // Clean up user state
                    delete userStates[from];
                    
                    return await message.reply(getCurrentTemplate()[lang].updatesConfirmed);
                } else if (normalizedText === '2') {
                    // User doesn't want updates
                    const userDataEntry = {
                        from,
                        lang,
                        response: 'no',
                        wantsUpdates: false,
                        timestamp: new Date().toISOString()
                    };
                    
                    userData.push(userDataEntry);
                    completedUsers.push(from);
                    
                    console.log(`✅ User ${from} doesn't want updates (${text} -> ${normalizedText}):`, userDataEntry);
                    console.log(`📊 Total completed users: ${completedUsers.length}`);
                    
                    // Clean up user state
                    delete userStates[from];
                    
                    return await message.reply(getCurrentTemplate()[lang].updatesDeclined);
                } else {
                    console.log(`❌ User ${from} invalid input in WAIT_UPDATE_CHOICE: "${text}" (normalized: ${normalizedText})`);
                    return await message.reply(getCurrentTemplate()[lang].invalid);
                }
            }

            // Default response for invalid input
            console.log(`❌ User ${from} invalid input in step ${userStates[from].step}: "${text}"`);
            return await message.reply(getCurrentTemplate()[lang].invalid);

        } catch (error) {
            console.error('❌ Error processing message:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                from: message?.from,
                text: message?.body
            });
            
            try {
                await message.reply("عذراً، حدث خطأ. يرجى المحاولة مرة أخرى.\nSorry, an error occurred. Please try again.");
            } catch (replyError) {
                console.error('❌ Failed to send error message:', replyError);
            }
        }
    });
    
    console.log('✅ Message handler registered successfully');
    
        } catch (error) {
            console.error('❌ Error registering message handler:', error);
            throw error;
        }
    }
    
    // Call the function to register the handler
    registerMessageHandler();
    
    // Test if client can send messages
    console.log('🔧 Testing client connection...');
    console.log('🔧 Client ready state:', client.info ? 'CONNECTED' : 'NOT CONNECTED');
    if (client.info) {
        console.log('🔧 Client info:', client.info.pushname, client.info.wid.user);
        
        // Test sending a message to see if the client works
        try {
            console.log('🔧 Testing message sending capability...');
            // Don't actually send, just test if the method exists
            if (typeof client.sendMessage === 'function') {
                console.log('✅ Client has sendMessage method');
            } else {
                console.log('❌ Client missing sendMessage method');
            }
        } catch (error) {
            console.log('❌ Error testing client:', error.message);
        }
    }

    // Return stats function for monitoring
    return {
        getUserStats: () => ({
            totalUsers: Object.keys(userStates).length,
            completedUsers: completedUsers.length,
            totalData: userData.length,
            userData: [...userData] // Return copy of data
        }),
        resetStats: () => {
            userStates = {};
            userData = [];
            completedUsers = [];
            console.log('🔄 Bot statistics reset');
        },
        resetUserStates: () => {
            userStates = {};
            userData = [];
            completedUsers = [];
            console.log('🔄 All user states reset - users can start new conversations');
        },
        forceResetUsers: () => {
            userStates = {};
            userData = [];
            completedUsers = [];
            console.log('🔄 FORCE RESET: All user states cleared - users can start new conversations');
        },
        reloadActiveTemplate,
        getCurrentTemplate,
        loadActiveTemplate
    };
}

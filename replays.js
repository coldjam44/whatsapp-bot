// replays.js - Real Estate Bot Reply System
export default function registerMessageHandlers(client) {
    // User states management
    let userStates = {};
    let userData = [];
    let completedUsers = [];
  
    // Regex for numbers (Arabic + English)
    const numberRegex = /^[0-9\u0660-\u0669]+$/;
  
    // Language-specific texts/templates
    const texts = {
        ar: {
            offers: "القائمة:\n1️⃣ عرض رقم 1: فيلا راقية 500م² 💎\n2️⃣ عرض رقم 2: شقة فاخرة مطلة على البحر 🌊\nأرسل أي رقم لاختيار العرض",
            askName: (num) => `تمام ✅ اخترت عرض رقم ${num}\nبرجاء كتابة اسمك فقط`,
            askPhone: (name) => `شكرًا لك ${name}.\nالآن أرسل رقم جوالك`,
            thank: "شكرًا لك 🌹 سيتم التواصل معك قريبًا",
            invalid: "أرسل رقم لعرض العروض",
            welcome: "مرحبا بك في العقارية 🌟\nنقدم عروض مميزة\nأرسل أي رقم لعرض العروض",
            welcomeEn: "Welcome to Real Estate 🌟\nWe offer great deals\nSend any number to view offers",
            invalidNumber: "❌ الرجاء إدخال رقم صالح",
            validNumber: "أرسل رقم صالح"
        },
        en: {
            offers: "List:\n1️⃣ Offer 1: Villa 500m² 💎\n2️⃣ Offer 2: Luxury apartment 🌊\nSend any number to choose",
            askName: (num) => `Great ✅ You chose Offer ${num}\nPlease enter your name`,
            askPhone: (name) => `Thank you ${name}.\nNow send your phone number`,
            thank: "Thank you 🌹 Our sales team will contact you",
            invalid: "Send a number to view offers",
            welcome: "مرحبا بك في العقارية 🌟\nنقدم عروض مميزة\nأرسل أي رقم لعرض العروض",
            welcomeEn: "Welcome to Real Estate 🌟\nWe offer great deals\nSend any number to view offers",
            invalidNumber: "❌ Please enter a valid number",
            validNumber: "Send a valid number"
        }
    };

    // Convert Arabic numbers to English
    const convertArabicNumbers = (text) => {
        return text.replace(/\u0660/g, '0')
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

    // Main message handler
    client.on('message', async (message) => {
        try {
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

            console.log(`📱 Processing message from ${from}: "${text}"`);

            // First time: ask for language choice
            if (!userStates[from]) {
                userStates[from] = { step: 'CHOOSE_LANG' };
                console.log(`🌍 New user ${from} - asking for language choice`);
                
                return await message.reply(
                    "أهلاً بك 🌟\n" +
                    "رجاء اختر اللغة:\n" +
                    "1 - العربية 🇸🇦\n" +
                    "2 - English 🇬🇧\n" +
                    "يمكنك إدخال أي رقم من 1 للأعلى"
                );
            }

            // Language selection: accept any number
            if (userStates[from].step === 'CHOOSE_LANG') {
                if (numberRegex.test(text)) {
                    if (/^(1|١)$/.test(text)) {
                        userStates[from].lang = 'ar';
                        userStates[from].step = 'WELCOME';
                        console.log(`🇸🇦 User ${from} chose Arabic`);
                        return await message.reply(texts.ar.welcome);
                    } else {
                        userStates[from].lang = 'en';
                        userStates[from].step = 'WELCOME';
                        console.log(`🇬🇧 User ${from} chose English`);
                        return await message.reply(texts.en.welcomeEn);
                    }
                } else {
                    console.log(`❌ User ${from} entered invalid input for language: "${text}"`);
                    return await message.reply(texts.ar.invalidNumber);
                }
            }

            // Get current language
            const lang = userStates[from].lang;

            // Welcome → Show offers
            if (userStates[from].step === 'WELCOME') {
                if (numberRegex.test(text)) {
                    userStates[from].step = 'CHOOSE_OFFER';
                    console.log(`📋 User ${from} proceeding to offers`);
                    return await message.reply(texts[lang].offers);
                }
                console.log(`❌ User ${from} invalid input in WELCOME step: "${text}"`);
                return await message.reply(texts[lang].invalid);
            }

            // Choose offer
            if (userStates[from].step === 'CHOOSE_OFFER') {
                if (numberRegex.test(text)) {
                    const offerNum = convertArabicNumbers(text);
                    userStates[from].step = 'ASK_NAME';
                    userStates[from].offer = offerNum;
                    console.log(`🏠 User ${from} chose offer ${offerNum}`);
                    return await message.reply(texts[lang].askName(offerNum));
                }
                console.log(`❌ User ${from} invalid input in CHOOSE_OFFER step: "${text}"`);
                return await message.reply(texts[lang].validNumber);
            }

            // Ask for name
            if (userStates[from].step === 'ASK_NAME') {
                userStates[from].name = text;
                userStates[from].step = 'ASK_PHONE';
                console.log(`📝 User ${from} provided name: "${text}"`);
                return await message.reply(texts[lang].askPhone(text));
            }

            // Ask for phone number
            if (userStates[from].step === 'ASK_PHONE') {
                // Store user data
                const userDataEntry = {
                    from,
                    lang,
                    offer: userStates[from].offer,
                    name: userStates[from].name,
                    phone: text,
                    timestamp: new Date().toISOString()
                };
                
                userData.push(userDataEntry);
                completedUsers.push(from);
                
                console.log(`✅ User ${from} completed registration:`, userDataEntry);
                console.log(`📊 Total completed users: ${completedUsers.length}`);
                console.log(`📊 Total user data entries: ${userData.length}`);
                
                // Clean up user state
                delete userStates[from];
                
                return await message.reply(texts[lang].thank);
            }

            // Default response for invalid input
            console.log(`❌ User ${from} invalid input in step ${userStates[from].step}: "${text}"`);
            return await message.reply(texts[lang].invalid);

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
        }
    };
}

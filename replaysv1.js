// replays.js - Real Estate Bot Reply System
export default function registerMessageHandlers(client) {
    // User states management
    let userStates = {};
    let userData = [];
    let completedUsers = [];
  
    // Regex for numbers (Arabic + English)
    const numberRegex = /^[0-9\u0660-\u0669]+$/;
  
    // API Configuration
    const API_BASE_URL = 'https://realestate.azsystems.tech';
    
    // Fetch offers from API (always fresh, no caching)
    const fetchOffers = async () => {
        try {
            console.log('🌐 Fetching fresh offers from API...');
            const response = await fetch(`${API_BASE_URL}/api/bot/offers`);
            
            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.data && Array.isArray(data.data)) {
                console.log(`✅ Fetched ${data.count} fresh offers from API`);
                return data.data;
            } else {
                throw new Error('Invalid API response format');
            }
            
        } catch (error) {
            console.error('❌ Error fetching offers from API:', error.message);
            
            // Return fallback offers if API fails
            return [
                {
                    display_text_ar: "عرض احتياطي - فيلا راقية 500م²",
                    display_text_en: "Fallback Offer - Luxury Villa 500m²"
                },
                {
                    display_text_ar: "عرض احتياطي - شقة فاخرة مطلة على البحر",
                    display_text_en: "Fallback Offer - Luxury Sea View Apartment"
                }
            ];
        }
    };
    
    // Generate offers text based on language and fetched data
    const generateOffersText = (offers, lang) => {
        if (!offers || offers.length === 0) {
            return lang === 'ar' ? "عذراً، لا توجد عروض متاحة حالياً" : "Sorry, no offers available at the moment";
        }
        
        let offersText = lang === 'ar' ? "القائمة:\n" : "List:\n";
        
        offers.forEach((offer, index) => {
            const emoji = index === 0 ? "💎" : index === 1 ? "🌊" : "🏢";
            const offerText = lang === 'ar' ? offer.display_text_ar : offer.display_text_en;
            
            if (lang === 'ar') {
                offersText += `${index + 1}️⃣ عرض رقم ${index + 1}: ${offerText} ${emoji}\n`;
            } else {
                offersText += `${index + 1}️⃣ Offer ${index + 1}: ${offerText} ${emoji}\n`;
            }
        });
        
        offersText += lang === 'ar' ? "أرسل أي رقم لاختيار العرض" : "Send any number to choose an offer";
        
        return offersText;
    };
  
    // Language-specific texts/templates
    const texts = {
        ar: {
            askName: (num, offerText) => `تمام ✅ اخترت عرض رقم ${num}\n${offerText}\nبرجاء كتابة اسمك فقط`,
            askPhone: (name) => `شكرًا لك ${name}.\nالآن أرسل رقم جوالك`,
            thank: "شكرًا لك 🌹 سيتم التواصل معك قريبًا",
            invalid: "أرسل رقم لعرض العروض",
            welcome: "مرحبا بك في العقارية 🌟\nنقدم عروض مميزة\nأرسل أي رقم لعرض العروض",
            welcomeEn: "Welcome to Real Estate 🌟\nWe offer great deals\nSend any number to view offers",
            invalidNumber: "❌ الرجاء إدخال رقم صالح",
            validNumber: "أرسل رقم صالح",
            loadingOffers: "⏳ جاري تحميل العروض...",
            noOffersAskName: "عذراً، لا توجد عروض متاحة حالياً 📋\nلكن يمكننا إرسال العروض الجديدة لك مباشرة\nبرجاء كتابة اسمك"
        },
        en: {
            askName: (num, offerText) => `Great ✅ You chose Offer ${num}\n${offerText}\nPlease enter your name`,
            askPhone: (name) => `Thank you ${name}.\nNow send your phone number`,
            thank: "Thank you 🌹 Our sales team will contact you",
            invalid: "Send a number to view offers",
            welcome: "مرحبا بك في العقارية 🌟\nنقدم عروض مميزة\nأرسل أي رقم لعرض العروض",
            welcomeEn: "Welcome to Real Estate 🌟\nWe offer great deals\nSend any number to view offers",
            invalidNumber: "❌ Please enter a valid number",
            validNumber: "Send a valid number",
            loadingOffers: "⏳ Loading offers...",
            noOffersAskName: "Sorry, no offers are available at the moment 📋\nBut we can send you new offers directly\nPlease enter your name"
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
                    console.log(`📋 User ${from} proceeding to offers`);
                    
                    // Send loading message first
                    await message.reply(texts[lang].loadingOffers);
                    
                    // Fetch offers from API
                    const offers = await fetchOffers();
                    
                    // Check if offers are available
                    if (offers && offers.length > 0) {
                        userStates[from].step = 'CHOOSE_OFFER';
                        const offersText = generateOffersText(offers, lang);
                        userStates[from].offers = offers;
                        return await message.reply(offersText);
                    } else {
                        // No offers available - go directly to contact collection
                        userStates[from].step = 'ASK_NAME';
                        userStates[from].offer = 'no_offers';
                        userStates[from].selectedOfferText = lang === 'ar' ? 'لا توجد عروض متاحة حالياً' : 'No offers available at the moment';
                        
                        console.log(`📋 User ${from} - No offers available, proceeding to contact collection`);
                        return await message.reply(texts[lang].noOffersAskName);
                    }
                }
                console.log(`❌ User ${from} invalid input in WELCOME step: "${text}"`);
                return await message.reply(texts[lang].invalid);
            }

            // Choose offer
            if (userStates[from].step === 'CHOOSE_OFFER') {
                if (numberRegex.test(text)) {
                    const offerNum = convertArabicNumbers(text);
                    const offerIndex = parseInt(offerNum) - 1;
                    
                    // Validate offer selection
                    if (offerIndex >= 0 && offerIndex < userStates[from].offers.length) {
                        const selectedOffer = userStates[from].offers[offerIndex];
                        const offerText = lang === 'ar' ? selectedOffer.display_text_ar : selectedOffer.display_text_en;
                        
                        userStates[from].step = 'ASK_NAME';
                        userStates[from].offer = offerNum;
                        userStates[from].selectedOfferText = offerText;
                        
                        console.log(`🏠 User ${from} chose offer ${offerNum}: ${offerText}`);
                        return await message.reply(texts[lang].askName(offerNum, offerText));
                    } else {
                        console.log(`❌ User ${from} chose invalid offer number: ${offerNum}`);
                        // Fetch fresh offers from API and re-display
                        const freshOffers = await fetchOffers();
                        const offersText = generateOffersText(freshOffers, lang);
                        userStates[from].offers = freshOffers; // Update stored offers
                        return await message.reply(`${texts[lang].validNumber}\n\n${offersText}`);
                    }
                }
                console.log(`❌ User ${from} invalid input in CHOOSE_OFFER step: "${text}"`);
                // Fetch fresh offers from API and re-display
                const freshOffers = await fetchOffers();
                const offersText = generateOffersText(freshOffers, lang);
                userStates[from].offers = freshOffers; // Update stored offers
                return await message.reply(`${texts[lang].validNumber}\n\n${offersText}`);
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
                // Store user data with offer details
                const userDataEntry = {
                    from,
                    lang,
                    offer: userStates[from].offer,
                    selectedOfferText: userStates[from].selectedOfferText,
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
                
                // Different thank you message based on whether offers were available
                const thankMessage = userDataEntry.offer === 'no_offers' 
                    ? (lang === 'ar' 
                        ? "شكرًا لك 🌹\nتم تسجيل بياناتك وسنرسل لك العروض الجديدة مباشرة عند توفرها"
                        : "Thank you 🌹\nYour information has been registered and we will send you new offers directly when available")
                    : texts[lang].thank;
                
                return await message.reply(thankMessage);
            }

            // Default response for invalid input
            console.log(`❌ User ${from} invalid input in step ${userStates[from].step}: "${text}"`);
            
            // If user is in CHOOSE_OFFER step and enters invalid input, fetch fresh offers and re-show
            if (userStates[from].step === 'CHOOSE_OFFER') {
                const freshOffers = await fetchOffers();
                const offersText = generateOffersText(freshOffers, lang);
                userStates[from].offers = freshOffers; // Update stored offers
                return await message.reply(`${texts[lang].validNumber}\n\n${offersText}`);
            }
            
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

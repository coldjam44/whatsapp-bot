// botMessages.js
module.exports = function registerMessageHandlers(client) {
    // حالات المستخدمين
    let userStates = {};
    let userData = [];
    let completedUsers = [];
  
    // regex للأرقام (عربي + إنجليزي)
    const numberRegex = /^[0-9\u0660-\u0669]+$/;
  
    client.on('message', async (message) => {
      try {
        if (message.from.endsWith('@g.us')) {
      // console.log('⛔ تجاهل رسالة قروب:', message.body);
      return;
    } // تجاهل الرسائل من القروبات
  
        const from = message.from;
        const text = message.body.trim();
  
        if (completedUsers.includes(from)) return;
  
        // أول مرة: نطلب منه اختيار اللغة
        if (!userStates[from]) {
          userStates[from] = { step: 'CHOOSE_LANG' };
          return message.reply(
            "أهلاً بك 🌟\n" +
            "رجاء اختر اللغة:\n" +
            "1 - العربية 🇸🇦\n" +
            "2 - English 🇬🇧\n" +
            "يمكنك إدخال أي رقم من 1 للأعلى"
          );
        }
  
        // اختيار اللغة: يقبل أي رقم
        if (userStates[from].step === 'CHOOSE_LANG') {
          if (numberRegex.test(text)) {
            if (/^(1|١)$/.test(text)) {
              userStates[from].lang = 'ar';
              userStates[from].step = 'WELCOME';
              return message.reply("مرحبا بك في العقارية 🌟\nنقدم عروض مميزة\nأرسل أي رقم لعرض العروض");
            } else {
              userStates[from].lang = 'en';
              userStates[from].step = 'WELCOME';
              return message.reply("Welcome to Real Estate 🌟\nWe offer great deals\nSend any number to view offers");
            }
          } else {
            return message.reply("❌ الرجاء إدخال رقم صالح");
          }
        }
  
        // نصوص/قوالب
        let lang = userStates[from].lang;
        const texts = {
          ar: {
            offers: "القائمة:\n1️⃣ عرض رقم 1: فيلا راقية 500م² 💎\n2️⃣ عرض رقم 2: شقة فاخرة مطلة على البحر 🌊\nأرسل أي رقم لاختيار العرض",
            askName: num => `تمام ✅ اخترت عرض رقم ${num}\nبرجاء كتابة اسمك فقط`,
            askPhone: name => `شكرًا لك ${name}.\nالآن أرسل رقم جوالك`,
            thank: "شكرًا لك 🌹 سيتم التواصل معك قريبًا",
            invalid: "أرسل رقم لعرض العروض"
          },
          en: {
            offers: "List:\n1️⃣ Offer 1: Villa 500m² 💎\n2️⃣ Offer 2: Luxury apartment 🌊\nSend any number to choose",
            askName: num => `Great ✅ You chose Offer ${num}\nPlease enter your name`,
            askPhone: name => `Thank you ${name}.\nNow send your phone number`,
            thank: "Thank you 🌹 Our sales team will contact you",
            invalid: "Send a number to view offers"
          }
        };
  
        // ترحيب → عرض العروض
        if (userStates[from].step === 'WELCOME') {
          if (numberRegex.test(text)) {
            userStates[from].step = 'CHOOSE_OFFER';
            return message.reply(texts[lang].offers);
          }
          return message.reply(texts[lang].invalid);
        }
  
        // اختيار العرض
        if (userStates[from].step === 'CHOOSE_OFFER') {
          if (numberRegex.test(text)) {
            const offerNum = text.replace(/\u0660/g, '0') // تحويل الأرقام العربية للإنجليزية
                                 .replace(/\u0661/g, '1')
                                 .replace(/\u0662/g, '2')
                                 .replace(/\u0663/g, '3')
                                 .replace(/\u0664/g, '4')
                                 .replace(/\u0665/g, '5')
                                 .replace(/\u0666/g, '6')
                                 .replace(/\u0667/g, '7')
                                 .replace(/\u0668/g, '8')
                                 .replace(/\u0669/g, '9');
            userStates[from].step = 'ASK_NAME';
            userStates[from].offer = offerNum;
            return message.reply(texts[lang].askName(offerNum));
          }
          return message.reply(lang === 'ar' ? "أرسل رقم صالح" : "Send a valid number");
        }
  
        // الاسم
        if (userStates[from].step === 'ASK_NAME') {
          userStates[from].name = text;
          userStates[from].step = 'ASK_PHONE';
          return message.reply(texts[lang].askPhone(text));
        }
  
        // رقم الهاتف
        if (userStates[from].step === 'ASK_PHONE') {
          userData.push({
            from,
            lang,
            offer: userStates[from].offer,
            name: userStates[from].name,
            phone: text
          });
          completedUsers.push(from);
          delete userStates[from];
          return message.reply(texts[lang].thank);
        }
  
        return message.reply(texts[lang].invalid);
  
      } catch (error) {
        console.error('خطأ أثناء الرد على الرسالة:', error);
      }
    });
  };
  
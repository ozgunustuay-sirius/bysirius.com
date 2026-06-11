/*!
 * BY Sirius Group — AI Stratejist Asistanı + Çerez Onayı
 * chatbot.js v1.0
 */
(function () {
    'use strict';

    function getLang() {
        var btn = document.getElementById('lang-en');
        return (btn && btn.classList.contains('active')) ? 'en' : 'tr';
    }

    /* ───────────── COOKIE CONSENT ───────────── */
    function initConsent() {
        if (localStorage.getItem('bysCookieOK')) return;
        var lang = getLang();
        var txt = {
            tr: { msg: 'Bu site deneyiminizi iyileştirmek ve ziyaretçi analizleri için çerezler kullanmaktadır.', link: 'Gizlilik Politikası', btn: 'Kabul Et' },
            en: { msg: 'This site uses cookies to improve your experience and for visitor analytics.', link: 'Privacy Policy', btn: 'Accept' }
        }[lang] || { msg: '', link: '', btn: '' };

        var banner = document.createElement('div');
        banner.id = 'bys-cookie';
        banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:10002;background:rgba(9,14,26,0.97);border-top:1px solid rgba(255,255,255,0.1);padding:14px 20px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;backdrop-filter:blur(10px);font-family:inherit';
        banner.innerHTML =
            '<p style="margin:0;font-size:0.83rem;color:rgba(255,255,255,0.8);flex:1;min-width:180px">' + txt.msg +
            ' <a href="gizlilik-politikasi.html" style="color:#90cdf4;text-decoration:underline">' + txt.link + '</a></p>' +
            '<button id="bys-cookie-btn" style="background:#2563eb;color:#fff;border:none;border-radius:8px;padding:9px 22px;font-size:0.83rem;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0">' + txt.btn + '</button>';
        document.body.appendChild(banner);

        document.getElementById('bys-cookie-btn').addEventListener('click', function () {
            localStorage.setItem('bysCookieOK', '1');
            banner.style.transition = 'opacity .3s';
            banner.style.opacity = '0';
            setTimeout(function () { if (banner.parentNode) banner.parentNode.removeChild(banner); }, 320);
        });
    }

    /* ───────────── KNOWLEDGE BASE ───────────── */
    var KB = {
        tr: {
            welcome: 'Merhaba! 👋 BY Sirius Group AI Stratejist Asistanı\'yım.\n\nHizmetlerimiz, fiyatlandırma ve randevu konularında yardımcı olabilirim.',
            botName: 'BY Sirius AI Asistan',
            placeholder: 'Bir şeyler yazın...',
            quick: ['Hizmetler neler?', 'Fiyatlar nasıl?', 'Nasıl iletişim kurarım?', 'Randevu almak istiyorum'],
            rules: [
                { re: /merhaba|selam|iyi günler|hey|nasılsın/i, r: 'Merhaba! 😊 Size nasıl yardımcı olabilirim?\n\nSorabileceğiniz konular: hizmetler, fiyatlar, randevu, ödeme, iletişim.' },
                { re: /hizmet|ne yapıyor|neler sunuyor|katalog/i, r: '📋 Sunduğumuz hizmetler:\n\n🌐 Web Tasarım (Starter→Kurumsal)\n🔍 SEO & Anahtar Kelime\n📊 Google Analytics 4 & Search Console\n📍 Google Business Profile\n🔧 Web Sitesi Bakım\n🤖 Chatbot & AI Otomasyon\n📅 AI Randevu & Rezervasyon\n🎯 Akıllı CRM & Lead Yönetimi\n✍️ AI İçerik Üretimi\n⚖️ Hukuk & Finans Otomasyonu\n⚡ Özel AI Yazılım\n🚀 Dijital Dönüşüm Stratejisi\n\n→ <a href="hizmetlerimiz.html" class="bys-lnk">Hizmetlerimiz</a> | <a href="odeme.html" class="bys-lnk">Ürün Kataloğu</a>' },
                { re: /fiyat|ücret|maliyet|ne kadar|paket|plan|teklif/i, r: 'Tüm hizmetlerimiz müşteriye özel teklif bazlıdır.\n💳 Ödeme güvenli Stripe Payment Link ile yapılır.\n\n→ <a href="iletisim.html" class="bys-lnk">Teklif İste</a> | <a href="odeme.html" class="bys-lnk">Ürün Kataloğu</a>' },
                { re: /randevu|toplantı|görüşme|demo|görüşelim/i, r: 'Randevu ve demo için:\n\n📋 <a href="iletisim.html" class="bys-lnk">İletişim Formu →</a>\n💬 WhatsApp: <a href="https://wa.me/905355032634" target="_blank" class="bys-lnk">+90 535 503 26 34</a>\n📧 info@bysiriusgroup.com' },
                { re: /ödeme|stripe|nasıl öde|ödeme yöntem/i, r: 'Ödeme süreci:\n1️⃣ Teklif talep edin\n2️⃣ Kapsam onaylanır\n3️⃣ Stripe Payment Link gönderilir\n4️⃣ Güvenli ödeme yapılır\n\n→ <a href="odeme.html" class="bys-lnk">Ödeme Sayfası</a>' },
                { re: /iletişim|ulaş|telefon|email|eposta|mail|whatsapp|adres/i, r: '📧 info@bysiriusgroup.com\n📞 UK: +44 7442 056474\n📞 TR: +90 535 503 26 34\n💬 WhatsApp: +90 535 503 26 34\n📍 71-75 Shelton St, Covent Garden, London\n\n→ <a href="iletisim.html" class="bys-lnk">İletişim Formu</a>' },
                { re: /web site|web tasarım|website|landing page|sayfa tasarım/i, r: 'Web Tasarım Paketlerimiz:\n\n📦 Starter — 7 sayfa, SSL, domain, 30 gün garanti\n📦 Dijital — 12 sayfa, GA4, GBP, SEO\n⭐ Büyüme PRO — 20 sayfa, AI chatbot, WhatsApp API\n🏢 Kurumsal — E-ticaret, özel CRM, 7/24 destek\n\n→ <a href="odeme.html" class="bys-lnk">Detaylı Katalog</a>' },
                { re: /seo|arama motor|google sıralama|organik|backlink/i, r: 'SEO Hizmetlerimiz:\n🔍 Temel On-Page SEO\n🔑 Anahtar Kelime Araştırması\n📈 Aylık SEO Yönetimi\n📍 Yerel SEO & Google Maps\n\n→ <a href="hizmetlerimiz.html" class="bys-lnk">Detaylar</a>' },
                { re: /chatbot|bot|otomasyon|whatsapp bot|instagram bot/i, r: 'Chatbot & Otomasyon:\n💬 Temel AI Web Chatbot\n🤖 GPT Destekli Chatbot\n📱 WhatsApp Business API\n📸 Instagram & Messenger Otomasyon\n\n→ <a href="hizmetlerimiz.html#chatbot" class="bys-lnk">Detaylar</a>' },
                { re: /crm|lead|müşteri yönetim|potansiyel|satış huni/i, r: 'Akıllı CRM & Lead Yönetimi:\n✅ Otomatik lead toplama & skorlama\n✅ Müşteri davranış analizi\n✅ Dinamik satış huni yönetimi\n\n→ <a href="hizmetlerimiz.html#crm-lead" class="bys-lnk">Detaylar</a>' },
                { re: /şirket|biz kimiz|kimsiniz|hakkında|by sirius|london|ingiltere/i, r: 'BY Sirius Group AI and Technology Co. Ltd.\n🏢 Companies House No: 17142392\n📍 71-75 Shelton Street, Covent Garden, London\n🌍 İngiltere & Türkiye aktif\n\n→ <a href="hakkimizda.html" class="bys-lnk">Hakkımızda</a>' },
                { re: /sektör|otel|klinik|hastane|emlak|e-ticaret|hukuk|finans|spor|güzellik/i, r: 'Çalıştığımız sektörler:\n🏨 Otel & Konaklama\n🦷 Diş Klinikleri & Sağlık\n🏠 Gayrimenkul\n💆 Güzellik & Estetik\n💪 Spor Salonları\n💰 Finans & Muhasebe\n⚖️ Hukuk Büroları\n🛒 E-Ticaret\n\n→ <a href="sektorler.html" class="bys-lnk">Sektörler</a>' },
                { re: /analitik|analytics|ga4|search console|google analytics/i, r: 'Analytics Hizmetleri:\n📊 Google Analytics 4 Kurulumu\n🔍 Google Search Console\n🎯 GA4 + Search Console Kombo\n\n→ <a href="odeme.html" class="bys-lnk">Katalog</a>' },
                { re: /gbp|google business|harita|google maps|yerel profil/i, r: 'Google Business Profile:\n📍 GBP Kurulum & Optimizasyon\n📅 GBP Aylık Yönetimi\n⭐ GBP Premium (Haftada 2 post)\n\n→ <a href="odeme.html" class="bys-lnk">Katalog</a>' },
                { re: /bakım|destek|güncelleme|maintenance/i, r: 'Web Sitesi Bakım:\n🔧 Aylık Bakım — güncelleme, yedek, 2 değişiklik\n🔧 Aylık Bakım PRO — 5 değişiklik + SEO raporu\n\n→ <a href="odeme.html" class="bys-lnk">Katalog</a>' },
                { re: /logo|marka|brand|kurumsal kimlik/i, r: 'Marka & Pazarlama:\n🎨 Logo & Marka Kimliği\n📱 Sosyal Medya Görsel Seti\n📧 E-Posta Pazarlama Kurulumu\n📋 QR Menü / Dijital Katalog\n\n→ <a href="odeme.html" class="bys-lnk">Katalog</a>' },
                { re: /blog|makale|içerik yazı/i, r: 'AI ve dijital dönüşüm hakkında güncel içerikler:\n\n→ <a href="blog.html" class="bys-lnk">Blog</a>' },
                { re: /iade|iptal|garanti|geri ödeme/i, r: '→ <a href="iade-iptal-politikasi.html" class="bys-lnk">İade & İptal Politikası</a>' },
                { re: /kvkk|gdpr|gizlilik|veri koruma/i, r: 'Verileriniz GDPR ve KVKK uyumlu işlenmektedir.\n\n→ <a href="gizlilik-politikasi.html" class="bys-lnk">Gizlilik Politikası</a>' },
                { re: /ai|yapay zeka|gpt|makine öğrenmesi/i, r: 'BY Sirius Group AI Çözümleri:\n🤖 GPT tabanlı chatbotlar\n📅 AI randevu sistemleri\n🎯 Akıllı CRM & lead skorlama\n✍️ AI içerik üretimi\n⚡ Özel AI yazılım geliştirme\n\n→ <a href="hizmetlerimiz.html" class="bys-lnk">AI Hizmetleri</a>' },
            ],
            def: 'Sorunuzu tam anlayamadım 🤔\n\nYardımcı olabileceğim konular:\n• Hizmetler & fiyatlar\n• Randevu & demo\n• İletişim bilgileri\n• Şirket hakkında\n\n→ <a href="iletisim.html" class="bys-lnk">Doğrudan İletişim</a>'
        },
        en: {
            welcome: 'Hello! 👋 I\'m the BY Sirius Group AI Strategy Assistant.\n\nI can help with services, pricing, appointments and more.',
            botName: 'BY Sirius AI Assistant',
            placeholder: 'Type something...',
            quick: ['What are your services?', 'How is pricing set?', 'How do I contact you?', 'Book a demo'],
            rules: [
                { re: /hello|hi|hey|good|greet/i, r: 'Hello! 😊 How can I help you today?\n\nI can assist with: services, pricing, appointments, payment, contact.' },
                { re: /service|what do you do|what do you offer|catalogue/i, r: '📋 Our services:\n\n🌐 Website Design (Starter→Corporate)\n🔍 SEO & Keyword Research\n📊 Google Analytics 4 & Search Console\n📍 Google Business Profile\n🔧 Monthly Website Maintenance\n🤖 Chatbot & AI Automation\n📅 AI Booking & Reservation\n🎯 Smart CRM & Lead Management\n✍️ AI Content Generation\n⚖️ Legal & Finance Automation\n⚡ Custom AI Software\n🚀 Digital Transformation Strategy\n\n→ <a href="hizmetlerimiz.html" class="bys-lnk">Services</a> | <a href="odeme.html" class="bys-lnk">Catalogue</a>' },
                { re: /price|cost|how much|pricing|package|plan|quote/i, r: 'All services are quote-based and tailored to your needs.\n💳 Payment via secure Stripe Payment Link.\n\n→ <a href="iletisim.html" class="bys-lnk">Request a Quote</a> | <a href="odeme.html" class="bys-lnk">Catalogue</a>' },
                { re: /appointment|meeting|demo|book|schedule/i, r: 'To book an appointment or demo:\n\n📋 <a href="iletisim.html" class="bys-lnk">Contact Form →</a>\n💬 WhatsApp: <a href="https://wa.me/905355032634" target="_blank" class="bys-lnk">+90 535 503 26 34</a>\n📧 info@bysiriusgroup.com' },
                { re: /payment|stripe|how to pay|pay/i, r: 'Payment process:\n1️⃣ Request a quote\n2️⃣ Scope is confirmed\n3️⃣ Custom Stripe link is sent\n4️⃣ Secure payment made\n\n→ <a href="odeme.html" class="bys-lnk">Payment Page</a>' },
                { re: /contact|reach|phone|email|whatsapp|address/i, r: '📧 info@bysiriusgroup.com\n📞 UK: +44 7442 056474\n📞 TR: +90 535 503 26 34\n💬 WhatsApp: +90 535 503 26 34\n📍 71-75 Shelton St, London\n\n→ <a href="iletisim.html" class="bys-lnk">Contact Form</a>' },
                { re: /website|web design|landing page/i, r: 'Website Design Packages:\n\n📦 Starter — 7 pages, SSL, domain, 30-day guarantee\n📦 Digital — 12 pages, GA4, GBP, SEO\n⭐ Growth PRO — 20 pages, AI chatbot, WhatsApp API\n🏢 Corporate — E-commerce, custom CRM, 24/7 support\n\n→ <a href="odeme.html" class="bys-lnk">Full Catalogue</a>' },
                { re: /seo|search engine|google ranking|organic/i, r: 'SEO Services:\n🔍 Basic On-Page SEO\n🔑 Keyword Research\n📈 Monthly SEO Management\n📍 Local SEO & Google Maps\n\n→ <a href="hizmetlerimiz.html" class="bys-lnk">Details</a>' },
                { re: /chatbot|bot|automation|whatsapp bot|instagram/i, r: 'Chatbot & Automation:\n💬 Basic AI Web Chatbot\n🤖 GPT-Powered Chatbot\n📱 WhatsApp Business API\n📸 Instagram & Messenger Automation\n\n→ <a href="hizmetlerimiz.html#chatbot" class="bys-lnk">Details</a>' },
                { re: /crm|lead|customer management|sales funnel/i, r: 'Smart CRM & Lead Management:\n✅ Automated lead capture & scoring\n✅ Customer behaviour analysis\n✅ Dynamic sales funnel management\n\n→ <a href="hizmetlerimiz.html#crm-lead" class="bys-lnk">Details</a>' },
                { re: /company|about|who are you|by sirius|london|uk/i, r: 'BY Sirius Group AI and Technology Co. Ltd.\n🏢 Companies House No: 17142392\n📍 71-75 Shelton Street, Covent Garden, London\n🌍 Active in UK & Turkey\n\n→ <a href="hakkimizda.html" class="bys-lnk">About Us</a>' },
                { re: /sector|industry|hotel|clinic|real estate|ecommerce|legal|finance|gym|beauty/i, r: 'Industries we serve:\n🏨 Hotels & Accommodation\n🦷 Dental Clinics & Healthcare\n🏠 Real Estate\n💆 Beauty & Aesthetics\n💪 Gyms & Fitness\n💰 Finance & Accounting\n⚖️ Law Firms\n🛒 E-Commerce\n\n→ <a href="sektorler.html" class="bys-lnk">Industries</a>' },
                { re: /analytics|ga4|search console|google analytics/i, r: 'Analytics Services:\n📊 Google Analytics 4 Setup\n🔍 Google Search Console\n🎯 GA4 + Search Console Combo\n\n→ <a href="odeme.html" class="bys-lnk">Catalogue</a>' },
                { re: /gbp|google business|google maps|local profile/i, r: 'Google Business Profile:\n📍 GBP Setup & Optimisation\n📅 Monthly GBP Management\n⭐ Premium GBP Management (2 posts/week)\n\n→ <a href="odeme.html" class="bys-lnk">Catalogue</a>' },
                { re: /maintenance|support|update|backup/i, r: 'Website Maintenance:\n🔧 Monthly Maintenance — updates, backup, 2 changes\n🔧 Monthly PRO — 5 changes + SEO report + priority support\n\n→ <a href="odeme.html" class="bys-lnk">Catalogue</a>' },
                { re: /logo|brand|identity/i, r: 'Branding & Marketing:\n🎨 Logo & Brand Identity\n📱 Social Media Visual Set\n📧 Email Marketing Setup\n📋 QR Menu / Digital Catalogue\n\n→ <a href="odeme.html" class="bys-lnk">Catalogue</a>' },
                { re: /blog|article|content/i, r: 'Up-to-date content on AI & digital transformation:\n\n→ <a href="blog.html" class="bys-lnk">Blog</a>' },
                { re: /refund|cancel|guarantee/i, r: '→ <a href="iade-iptal-politikasi.html" class="bys-lnk">Refund & Cancellation Policy</a>' },
                { re: /gdpr|privacy|data protection/i, r: 'Your data is processed in compliance with UK GDPR.\n\n→ <a href="gizlilik-politikasi.html" class="bys-lnk">Privacy Policy</a>' },
                { re: /ai|artificial intelligence|gpt|machine learning/i, r: 'BY Sirius Group AI Solutions:\n🤖 GPT-based chatbots\n📅 AI booking systems\n🎯 Smart CRM & lead scoring\n✍️ AI content generation\n⚡ Custom AI software\n\n→ <a href="hizmetlerimiz.html" class="bys-lnk">AI Services</a>' },
            ],
            def: 'I didn\'t quite understand 🤔\n\nI can help with:\n• Services & pricing\n• Appointments & demos\n• Contact information\n• About the company\n\n→ <a href="iletisim.html" class="bys-lnk">Direct Contact</a>'
        }
    };

    function getReply(msg, lang) {
        var rules = KB[lang] ? KB[lang].rules : KB.tr.rules;
        for (var i = 0; i < rules.length; i++) {
            if (rules[i].re.test(msg)) return rules[i].r;
        }
        return KB[lang] ? KB[lang].def : KB.tr.def;
    }

    /* ───────────── CHATBOT UI ───────────── */
    function initChatbot() {
        var lang = getLang();
        var t = KB[lang] || KB.tr;

        var style = document.createElement('style');
        style.textContent = [
            '#bys-chat-win{display:none;position:fixed;bottom:160px;right:24px;z-index:9998;width:340px;max-width:calc(100vw - 32px);background:#0d1826;border:1px solid rgba(255,255,255,0.12);border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,0.6);flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif}',
            '#bys-chat-msgs{height:270px;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.15) transparent}',
            '.bys-msg-bot{align-self:flex-start;background:rgba(255,255,255,0.07);color:#e2e8f0;padding:9px 12px;border-radius:12px 12px 12px 2px;font-size:0.82rem;max-width:92%;line-height:1.65;word-break:break-word}',
            '.bys-msg-user{align-self:flex-end;background:#2563eb;color:#fff;padding:9px 12px;border-radius:12px 12px 2px 12px;font-size:0.82rem;max-width:85%;line-height:1.5}',
            '.bys-lnk{color:#90cdf4;text-decoration:underline}',
            '#bys-chat-quick{padding:6px 10px;display:flex;gap:5px;flex-wrap:wrap;border-top:1px solid rgba(255,255,255,0.06)}',
            '.bys-qbtn{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#a0aec0;border-radius:20px;padding:4px 10px;font-size:0.73rem;cursor:pointer;transition:background .15s;font-family:inherit}',
            '.bys-qbtn:hover{background:rgba(255,255,255,0.13);color:#e2e8f0}',
            '#bys-chat-toggle{position:fixed;bottom:24px;right:24px;z-index:9998;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#1e3a6e,#2563eb);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,0.35);transition:transform .2s,box-shadow .2s}',
            '#bys-chat-toggle:hover{transform:scale(1.1);box-shadow:0 6px 22px rgba(0,0,0,0.45)}',
            '#bys-chat-input{flex:1;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;padding:8px 12px;font-size:0.83rem;outline:none;font-family:inherit}',
            '#bys-chat-input::placeholder{color:rgba(255,255,255,0.35)}',
            '#bys-chat-input:focus{border-color:rgba(99,179,237,0.5)}',
            '#bys-chat-send{background:#2563eb;color:#fff;border:none;border-radius:8px;padding:8px 14px;cursor:pointer;font-size:0.95rem;font-weight:700;transition:background .15s;flex-shrink:0}',
            '#bys-chat-send:hover{background:#1d4ed8}'
        ].join('');
        document.head.appendChild(style);

        var toggler = document.createElement('button');
        toggler.id = 'bys-chat-toggle';
        toggler.setAttribute('aria-label', t.botName);
        toggler.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>';

        var win = document.createElement('div');
        win.id = 'bys-chat-win';
        win.innerHTML =
            '<div style="background:linear-gradient(135deg,#1e3a6e,#2563eb);padding:13px 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">' +
            '<div style="display:flex;align-items:center;gap:10px">' +
            '<div style="width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;font-size:1rem">🤖</div>' +
            '<div><div data-bys-name style="font-size:0.84rem;font-weight:600;color:#fff">' + t.botName + '</div>' +
            '<div style="font-size:0.7rem;color:rgba(255,255,255,0.65)">Powered by BY Sirius Group</div></div></div>' +
            '<button id="bys-chat-close" style="background:none;border:none;color:rgba(255,255,255,0.65);cursor:pointer;font-size:1.15rem;line-height:1;padding:4px 6px" aria-label="Kapat">✕</button>' +
            '</div>' +
            '<div id="bys-chat-msgs"></div>' +
            '<div id="bys-chat-quick"></div>' +
            '<div style="padding:10px;border-top:1px solid rgba(255,255,255,0.08);display:flex;gap:8px;flex-shrink:0">' +
            '<input id="bys-chat-input" type="text" placeholder="' + t.placeholder + '" autocomplete="off">' +
            '<button id="bys-chat-send">→</button>' +
            '</div>';

        document.body.appendChild(toggler);
        document.body.appendChild(win);

        var msgs = document.getElementById('bys-chat-msgs');
        var inp = document.getElementById('bys-chat-input');
        var quickEl = document.getElementById('bys-chat-quick');

        function addMsg(text, isUser) {
            var el = document.createElement('div');
            el.className = isUser ? 'bys-msg-user' : 'bys-msg-bot';
            el.innerHTML = text.replace(/\n/g, '<br>');
            msgs.appendChild(el);
            msgs.scrollTop = msgs.scrollHeight;
        }

        function buildQuick() {
            quickEl.innerHTML = '';
            t.quick.forEach(function (q) {
                var b = document.createElement('button');
                b.className = 'bys-qbtn';
                b.textContent = q;
                b.addEventListener('click', function () { send(q); });
                quickEl.appendChild(b);
            });
        }

        function send(text) {
            if (!text.trim()) return;
            addMsg(text, true);
            quickEl.innerHTML = '';
            inp.value = '';
            setTimeout(function () { addMsg(getReply(text, getLang()), false); }, 380);
        }

        addMsg(t.welcome, false);
        buildQuick();

        var isOpen = false;
        var activeLang = lang;
        toggler.addEventListener('click', function () {
            isOpen = !isOpen;
            win.style.display = isOpen ? 'flex' : 'none';
            win.style.flexDirection = 'column';
            if (isOpen) {
                var newLang = getLang();
                if (newLang !== activeLang) {
                    activeLang = newLang;
                    t = KB[newLang] || KB.tr;
                    msgs.innerHTML = '';
                    addMsg(t.welcome, false);
                    buildQuick();
                    // update header name
                    var nameEl = win.querySelector('[data-bys-name]');
                    if (nameEl) nameEl.textContent = t.botName;
                    // update placeholder
                    inp.placeholder = t.placeholder;
                }
                inp.focus();
            }
        });
        document.getElementById('bys-chat-close').addEventListener('click', function () {
            isOpen = false;
            win.style.display = 'none';
        });
        document.getElementById('bys-chat-send').addEventListener('click', function () { send(inp.value); });
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(inp.value); });
    }

    /* ───────────── WHATSAPP BUTTON (failsafe) ───────────── */
    function initWhatsApp() {
        if (document.getElementById('bys-wa-btn')) return;
        var a = document.createElement('a');
        a.id = 'bys-wa-btn';
        a.href = 'https://wa.me/905355032634';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.setAttribute('aria-label', 'WhatsApp');
        a.style.cssText = 'position:fixed;bottom:90px;right:24px;z-index:9999;width:56px;height:56px;border-radius:50%;background:#25D366;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,0.35);text-decoration:none;transition:transform .2s,box-shadow .2s';
        a.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';
        a.addEventListener('mouseenter', function () { this.style.transform = 'scale(1.1)'; this.style.boxShadow = '0 6px 22px rgba(0,0,0,0.45)'; });
        a.addEventListener('mouseleave', function () { this.style.transform = 'scale(1)'; this.style.boxShadow = '0 4px 16px rgba(0,0,0,0.35)'; });
        document.body.appendChild(a);
    }

    /* ───────────── INIT ───────────── */
    function init() {
        initConsent();
        initChatbot();
        initWhatsApp();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());

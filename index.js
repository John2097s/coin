const mineflayer = require('mineflayer');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// ============================================================
// KONFIGURATION
// ============================================================
const MC_HOST    = 'DEIN-ATERNOS-SERVER.aternos.me';
const MC_PORT    = 25565;
const BOT_EMAIL  = 'dein-bot-account@gmail.com'; // Offline-Mode: beliebiger Name
const BOT_NAME   = 'CoinBot';
const SECRET     = '[COIN:a9f3]';
// ============================================================

// Firebase Admin initialisieren
const serviceAccount = require('./serviceAccount.json');
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

let bot;

function createBot() {
  bot = mineflayer.createBot({
    host: MC_HOST,
    port: MC_PORT,
    username: BOT_NAME,
    version: '1.20.1',
    auth: 'offline', // Aternos im Offline-Mode
  });

  bot.on('login', () => {
    console.log(`[CoinBot] Eingeloggt als ${BOT_NAME}`);
  });

  bot.on('message', async (jsonMsg) => {
    const msg = jsonMsg.toString();

    // Nur unsere geheimen Coin-Messages verarbeiten
    if (!msg.includes(SECRET)) return;

    // Format parsen: [COIN:a9f3] PLAYER|COINS|MOB
    const parts = msg.split(SECRET)[1].trim().split('|');
    if (parts.length !== 3) return;

    const [playerName, coinsStr, mobName] = parts;
    const coins = parseInt(coinsStr);
    if (!playerName || isNaN(coins)) return;

    console.log(`[CoinBot] Kill: ${playerName} +${coins} (${mobName})`);

    await giveCoins(playerName, coins, mobName);
  });

  bot.on('kicked', (reason) => {
    console.log('[CoinBot] Gekickt:', reason);
    setTimeout(createBot, 10000); // Nach 10s reconnecten
  });

  bot.on('error', (err) => {
    console.error('[CoinBot] Error:', err.message);
    setTimeout(createBot, 10000);
  });

  bot.on('end', () => {
    console.log('[CoinBot] Verbindung getrennt, reconnecting...');
    setTimeout(createBot, 10000);
  });
}

async function giveCoins(mcName, amount, reason) {
  try {
    // Spieler per mcName in Firestore suchen
    const snap = await db.collection('users')
      .where('mcName', '==', mcName)
      .limit(1)
      .get();

    if (snap.empty) {
      console.log(`[CoinBot] Spieler nicht gefunden: ${mcName}`);
      return;
    }

    const userRef = snap.docs[0].ref;

    // Coins updaten
    await userRef.update({
      coins: FieldValue.increment(amount),
      earnedTotal: FieldValue.increment(amount),
    });

    // Transaktion loggen
    await userRef.collection('transactions').add({
      desc: `${reason} getötet`,
      amount: amount,
      createdAt: FieldValue.serverTimestamp(),
    });

    console.log(`[CoinBot] ✅ ${mcName} +${amount} Coins (${reason})`);

  } catch (err) {
    console.error('[CoinBot] Firebase Error:', err.message);
  }
}

createBot();

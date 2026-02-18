// sync-firestore-to-csv.js
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const admin = require('firebase-admin');

// Load your Firebase service account key
const serviceAccount = require('./serviceAccountKey.json'); // Download from Firebase Console

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const MATCHES_CSV_PATH = path.join(__dirname, 'matches.csv');

async function main() {
  // Read all match docs from Firestore
  const snapshot = await db.collection('matches').get();
  const firestoreMatches = {};
  snapshot.forEach(doc => {
    firestoreMatches[doc.id] = doc.data();
  });

  // Read and parse matches.csv
  const csvText = fs.readFileSync(MATCHES_CSV_PATH, 'utf8');
  const records = parse(csvText, { columns: true, skip_empty_lines: true });

  // Update CSV records with Firestore results
  for (const row of records) {
    const matchId = String(row.id);
    if (firestoreMatches[matchId]) {
      const data = firestoreMatches[matchId];
      row.set1_h = data.set1_h ?? row.set1_h;
      row.set1_a = data.set1_a ?? row.set1_a;
      row.set2_h = data.set2_h ?? row.set2_h;
      row.set2_a = data.set2_a ?? row.set2_a;
      row.set3_h = data.set3_h ?? row.set3_h;
      row.set3_a = data.set3_a ?? row.set3_a;
      row.set4_h = data.set4_h ?? row.set4_h;
      row.set4_a = data.set4_a ?? row.set4_a;
      row.set5_h = data.set5_h ?? row.set5_h;
      row.set5_a = data.set5_a ?? row.set5_a;
      row.status = data.status ?? row.status;
    }
  }

  // Write updated CSV
  const output = stringify(records, { header: true });
  fs.writeFileSync(MATCHES_CSV_PATH, output, 'utf8');
  console.log('matches.csv updated from Firestore!');
}

main().catch(err => {
  console.error('Error syncing Firestore to CSV:', err);
});
// Historical one-time migration (pre-UUID Firestore driver-doc cleanup), not
// ongoing tooling — kept for reference. Safe to re-run: defaults to --dry-run.
const admin = require('../../services/firebase');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const db = admin.firestore();

async function migrate() {
  const isDryRun = !process.argv.includes('--apply');
  console.log(`Starting Firestore ID Migration (Dry Run: ${isDryRun})`);

  try {
    const driversSnapshot = await db.collection('drivers').get();
    let orphanCount = 0;

    for (const doc of driversSnapshot.docs) {
      // UUIDs are 36 characters long. Names are generally shorter or don't match the regex.
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      
      if (!uuidRegex.test(doc.id)) {
        orphanCount++;
        if (isDryRun) {
          console.log(`[DRY-RUN] Found name-keyed orphan: '${doc.id}' (Data: name=${doc.data().name})`);
        } else {
          console.log(`[APPLY] Deleting name-keyed orphan: '${doc.id}'`);
          await db.collection('drivers').doc(doc.id).delete();
        }
      } else {
        // console.log(`Valid UUID-keyed document: '${doc.id}'`);
      }
    }

    console.log(`\nMigration complete. Found ${orphanCount} name-keyed orphans.`);
    if (isDryRun && orphanCount > 0) {
      console.log('Run with node migrate_firestore_ids.js --apply to actually delete these orphans.');
    }
    
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();

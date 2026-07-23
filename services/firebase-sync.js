const admin = require('./firebase');

// One-way push only (SQL -> Firestore). A two-way listener used to live here too
// (syncFromFirebase), but nothing writes to Firestore's drivers/incidents
// collections ahead of the backend anymore — the driver-side profile-photo upload
// and the registration flow that used to do that were both removed — so it was
// pure dead weight. Removing it also drops the one thing in this backend that
// couldn't run as a serverless function (a permanently-open onSnapshot listener).
async function syncToFirebase(type, data) {
    if (!admin || !admin.apps.length) return;
    const db = admin.firestore();
    try {
        if (type === 'driver') {
            const driverIdStr = data.id.toString();
            await db.collection('drivers').doc(driverIdStr).set({
                ...data,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } else if (type === 'violation') {
            await db.collection('incidents').doc(data.id).set({
                ...data,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }
    } catch (err) {
        console.error('Firestore Up-Sync Error:', err.message);
    }
}

module.exports = { syncToFirebase };

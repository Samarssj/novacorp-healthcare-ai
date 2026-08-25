import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required to seed the care workspace.");

const pool = mysql.createPool(databaseUrl);

const patients = [
  ["patient-avery", "NCG-48219", "d5ccaf599fff846850c97ded2c0e46e29891ae3a5b8abcbd314901ad602dbaac", "Avery Carter", "AC", "May 18, 1988", "NovaCorp Gold Plus", "Active", "$55", "$245"],
  ["patient-maya", "NCG-91577", "646dfe7f55390f80d06b46429826a5bf1dd540ef3d23c4a5319b551fd8ec3efd", "Maya Singh", "MS", "August 9, 1979", "NovaCorp Gold Plus", "Active", "$35", "$680"],
  ["patient-jordan", "NCS-76064", "e7cd31e365415270ae901189915b076f67482f8d4c936ab58dcec363ad1180c2", "Jordan Brooks", "JB", "January 22, 1991", "NovaCorp Silver Select", "Active", "$70", "$910"],
];

const medications = [
  ["patient-avery", "Lisinopril", "10 mg · once daily"], ["patient-avery", "Vitamin D3", "1,000 IU · once daily"],
  ["patient-maya", "Metformin", "500 mg · twice daily"], ["patient-maya", "Atorvastatin", "20 mg · nightly"],
  ["patient-jordan", "Albuterol", "as needed"],
];

const allergies = [
  ["patient-avery", "Penicillin"], ["patient-avery", "Shellfish"], ["patient-maya", "Latex"], ["patient-jordan", "Sulfonamides"],
];

const slots = [
  ["slot-ortho-01", "Dr. Mara Leung", "Orthopedics", "Tomorrow", "8:40 AM", "North Pavilion", "available"],
  ["slot-ortho-02", "Dr. Julian Reyes", "Orthopedics", "Tomorrow", "10:20 AM", "North Pavilion", "available"],
  ["slot-cardio-01", "Dr. Theo Martin", "Cardiology", "Thursday", "9:15 AM", "East Medical Center", "available"],
  ["slot-derm-01", "Dr. Priya Shah", "Dermatology", "Friday", "1:30 PM", "West Pavilion", "available"],
];

const appointments = [
  ["appointment-avery-pcp", "patient-avery", "existing-avery-pcp", "Dr. Elena Park", "Primary care", "September 3", "2:15 PM", "Central Clinic", "scheduled", "NC-AVERY-0412"],
  ["appointment-maya-cardio", "patient-maya", "existing-maya-cardio", "Dr. Theo Martin", "Cardiology", "September 5", "11:00 AM", "East Medical Center", "scheduled", "NC-MAYA-9077"],
];

try {
  for (const patient of patients) {
    await pool.query(`INSERT INTO patients (id, memberId, phoneHash, name, initials, dateOfBirth, plan, planStatus, specialistCopay, deductibleRemaining)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE phoneHash=VALUES(phoneHash), name=VALUES(name), initials=VALUES(initials), dateOfBirth=VALUES(dateOfBirth), plan=VALUES(plan), planStatus=VALUES(planStatus), specialistCopay=VALUES(specialistCopay), deductibleRemaining=VALUES(deductibleRemaining)`, patient);
  }
  for (const [patientId, name, dosage] of medications) {
    const [existing] = await pool.query("SELECT id FROM patientMedications WHERE patientId=? AND name=? LIMIT 1", [patientId, name]);
    if (existing.length === 0) await pool.query("INSERT INTO patientMedications (patientId, name, dosage) VALUES (?, ?, ?)", [patientId, name, dosage]);
  }
  for (const [patientId, name] of allergies) {
    const [existing] = await pool.query("SELECT id FROM patientAllergies WHERE patientId=? AND name=? LIMIT 1", [patientId, name]);
    if (existing.length === 0) await pool.query("INSERT INTO patientAllergies (patientId, name) VALUES (?, ?)", [patientId, name]);
  }
  for (const slot of slots) {
    await pool.query(`INSERT INTO appointmentSlots (id, clinician, specialty, dayLabel, timeLabel, location, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE clinician=VALUES(clinician), specialty=VALUES(specialty), dayLabel=VALUES(dayLabel), timeLabel=VALUES(timeLabel), location=VALUES(location)`, slot);
  }
  for (const appointment of appointments) {
    await pool.query(`INSERT INTO patientAppointments (id, patientId, slotId, clinician, specialty, dateLabel, timeLabel, location, status, confirmationCode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE clinician=VALUES(clinician), specialty=VALUES(specialty), dateLabel=VALUES(dateLabel), timeLabel=VALUES(timeLabel), location=VALUES(location), status=VALUES(status), confirmationCode=VALUES(confirmationCode)`, appointment);
  }
  console.log("Seeded 3 patient profiles, appointments, medications, allergies, and availability.");
} finally {
  await pool.end();
}

process.exit(0);

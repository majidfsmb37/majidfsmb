module.exports = async (req, res) => {
  const voices = [
    { id: "george", name: "George - Warm Male", language: "English (US)" },
    { id: "mrbeast", name: "MrBeast - Energetic Male", language: "English (US)" },
    { id: "snoop", name: "Snoop - Cool Male", language: "English (US)" },
    { id: "gwyneth", name: "Gwyneth - Professional Female", language: "English (US)" },
    { id: "henry", name: "Henry - British Male", language: "English (UK)" },
    { id: "simba", name: "Simba - Friendly Male", language: "English (US)" },
    { id: "cliff", name: "Cliff - Deep Male", language: "English (US)" },
    { id: "nicole", name: "Nicole - Clear Female", language: "English (US)" },
    { id: "sara", name: "Sara - Soft Female", language: "English (US)" },
    { id: "emma", name: "Emma - British Female", language: "English (UK)" },
    { id: "oliver", name: "Oliver - Australian Male", language: "English (AU)" },
    { id: "isabella", name: "Isabella - Spanish Female", language: "Spanish" },
    { id: "diego", name: "Diego - Spanish Male", language: "Spanish" },
    { id: "amira", name: "Amira - Arabic Female", language: "Arabic" },
    { id: "omar", name: "Omar - Arabic Male", language: "Arabic" },
    { id: "priya", name: "Priya - Hindi Female", language: "Hindi" },
    { id: "raj", name: "Raj - Hindi Male", language: "Hindi" },
    { id: "ayesha", name: "Ayesha - Urdu Female", language: "Urdu" },
    { id: "ali", name: "Ali - Urdu Male", language: "Urdu" }
  ];
  
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json(voices);
};

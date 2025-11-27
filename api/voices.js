module.exports = async (req, res) => {
  const voices = [
    { id: "255656c1-d447-4746-a405-6bb496bbb156", name: "Majid (Cloned)", language: "Custom" },
    { id: "580f907d-33c4-4d55-ac9e-fa62c383dd69", name: "YY (Cloned)", language: "Custom" },
    { id: "default_male", name: "Default Male", language: "English" },
    { id: "default_female", name: "Default Female", language: "English" },
    { id: "henry", name: "Henry - British Male", language: "English (UK)" },
    { id: "simba", name: "Simba - Friendly Male", language: "English (US)" },
    { id: "cliff", name: "Cliff - Deep Male", language: "English (US)" },
    { id: "nicole", name: "Nicole - Clear Female", language: "English (US)" },
    { id: "sara", name: "Sara - Soft Female", language: "English (US)" }
  ];
  
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json(voices);
};

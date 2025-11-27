module.exports = async (req, res) => {
  try {
    const voices = [
      { id: "255656c1-d447-4746-a405-6bb496bbb156", name: "Majid (Cloned)", language: "Custom" },
      { id: "580f907d-33c4-4d55-ac9e-fa62c383dd69", name: "YY (Cloned)", language: "Custom" },
      { id: "default_male", name: "Default Male", language: "English" },
      { id: "default_female", name: "Default Female", language: "English" }
    ];
    
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(voices);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

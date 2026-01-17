
const picker = document.getElementById("accentPicker");

picker.oninput = () => {
  document.documentElement.style.setProperty("--accent", picker.value);
  saveSetting("accent", picker.value);
};

async function loadTheme() {
  const s = await getSetting("accent");
  if (s) {
    picker.value = s;
    document.documentElement.style.setProperty("--accent", s);
  }
}

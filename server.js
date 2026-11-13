const express = require("express");

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    name: "SCIENCE OS",
    version: "3.0",
    status: "ONLINE",
    message: "Научная система запущена!"
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    server: "SCIENCE OS CLOUD",
    online: true,
    modules: [
      "Astronomy",
      "Meteorology",
      "Radio Astronomy",
      "Games",
      "Mods",
      "Support"
    ]
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("SCIENCE OS CLOUD started on port " + PORT);
});

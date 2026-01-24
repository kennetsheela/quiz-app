const eventService = require("../services/eventService");

exports.createEvent = async (req, res) => {
  try {
    const event = await eventService.createEvent(req.body, req.files);
    res.status(201).json({ message: "Event created", eventId: event._id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.studentLogin = async (req, res) => {
  try {
    const participant = await eventService.studentLogin(req.body);
    res.json({ message: "Login successful", participantId: participant._id });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
};

exports.toggleSet = async (req, res) => {
  try {
    await eventService.toggleSet(req.body);
    res.json({ message: "Set status updated" });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
};

const parseStrict1 = require("../utils/parseStrict1");

/**
 * Question Pipeline Service
 * Handles extraction of questions from various file formats
 */
const questionPipelineService = {
    /**
     * Parse DOCX file and return structured questions
     */
    async parseDocx(buffer) {
        const result = await mammoth.extractRawText({ buffer });
        return this.extractQuestionsFromText(result.value);
    },

    /**
     * Parse PDF file and return structured questions
     */
    async parsePdf(buffer) {
        const data = await pdf(buffer);
        return this.extractQuestionsFromText(data.text);
    },

    /**
     * Extraction logic using parseStrict1.js
     */
    extractQuestionsFromText(text) {
        // Use the robust parser we created (parseStrict1.js)
        // Default category/topic/level are handled within parseStrict1 if not provided
        const questions = parseStrict1(text, {
            category: "aptitude",
            topic: "General",
            level: "medium"
        });

        return questions;
    }
};

module.exports = questionPipelineService;


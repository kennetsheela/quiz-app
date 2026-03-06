const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");
const QuestionBank = require("../models/QuestionBank");
const PracticeSet = require("../models/PracticeSet");
const parseStrict1 = require("../utils/parseStrict1");

/**
 * Pipeline Service
 * Handles sequential processing of question files
 */
const pipelineService = {
    /**
     * Phase 1: Parse file into structured questions
     */
    async parseQuestions(buffer, mimetype, category) {
        let text = "";
        if (mimetype === "application/pdf") {
            const data = await pdfParse(buffer);
            text = data.text;
        } else if (
            mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
            mimetype === "application/msword"
        ) {
            const result = await mammoth.extractRawText({ buffer });
            text = result.value;
        } else {
            throw new Error("Unsupported file format");
        }

        const questions = parseStrict1(text, { category });
        if (questions.length === 0) {
            throw new Error("No questions could be parsed from the document. Please check the format.");
        }
        return questions;
    },

    /**
     * Phase 2: Load questions into the database
     */
    async loadToQuestionBank(questions, creatorId) {
        // Get the current document count once
        let currentCount = await QuestionBank.countDocuments();

        // Add creator ID and manual questionID to each question
        const fresh = questions
            .filter(q => {
                const hasAnswer = q.answer !== null && q.answer !== undefined && String(q.answer).trim() !== "";
                if (!hasAnswer && q.question) {
                    console.warn(`⚠️ Skipping question without valid answer in pipelineService: "${q.question.substring(0, 50)}..."`);
                }
                return hasAnswer;
            })
            .map((q, index) => {
                const nextCount = currentCount + index + 1;
                return {
                    ...q,
                    questionID: `Q${String(nextCount).padStart(3, '0')}`,
                    createdBy: creatorId || "super-admin"
                };
            });

        if (fresh.length === 0) {
            console.error("❌ No valid questions (with non-empty answers) to insert in pipelineService.");
            return [];
        }

        const results = await QuestionBank.insertMany(fresh, { ordered: false });
        return results;
    },

    /**
     * Phase 3: Generate practice sets for the category
     */
    async generateSets(category) {
        console.log(`\n🔍 Generating sets for category: ${category}`);

        // Find all unique topic/level combinations for this category
        const topics = await QuestionBank.distinct("topic", { category });

        let totalSets = 0;
        const breakdown = [];

        for (const topic of topics) {
            const levels = await QuestionBank.distinct("level", { category, topic });

            for (const level of levels) {
                const count = await this.generateSetsForCombination(category, topic, level);
                if (count > 0) {
                    totalSets += count;
                    breakdown.push({ topic, level, count });
                }
            }
        }

        return { totalSets, breakdown };
    },

    /**
     * Helper to generate sets for a specific topic/level
     */
    async generateSetsForCombination(category, topic, level) {
        // Delete existing sets for this combination to avoid duplicates
        await PracticeSet.deleteMany({ category, topic, level });

        // Get all questions in fixed order
        const questions = await QuestionBank
            .find({ category, topic, level })
            .sort({ _id: 1 });

        if (questions.length < 10) {
            console.log(`   ⚠️  Only ${questions.length} questions for ${topic}/${level}, skipping...`);
            return 0;
        }

        let setNumber = 1;
        let createdCount = 0;

        for (let i = 0; i + 10 <= questions.length; i += 10) {
            const slice = questions.slice(i, i + 10);

            await PracticeSet.create({
                category,
                topic,
                level,
                setNumber,
                questions: slice.map(q => q._id)
            });

            setNumber++;
            createdCount++;
        }

        return createdCount;
    },

    /**
     * Execute full pipeline
     */
    async runFullPipeline(file, category, creatorId) {
        // Step 1: Parse
        const parsedQuestions = await this.parseQuestions(file.buffer, file.mimetype, category);

        // Step 2: Load
        const loadedQuestions = await this.loadToQuestionBank(parsedQuestions, creatorId);

        // Step 3: Generate Sets
        const setGenerationResult = await this.generateSets(category);

        return {
            status: "success",
            parsedCount: parsedQuestions.length,
            loadedCount: loadedQuestions.length,
            setsGenerated: setGenerationResult.totalSets,
            breakdown: setGenerationResult.breakdown
        };
    }
};

module.exports = pipelineService;

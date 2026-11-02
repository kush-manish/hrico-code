/** Resume upload: questions and the candidate profile. */
import { BadRequest } from '../errors.js';
import * as resume from '../resume.js';
import * as models from '../models.js';
import { extractProfile } from '../profile.js';
import { resumeLimit, requireCap, requireAi, wrap, upload } from '../middleware.js';

export function mount(app) {
  // ------------------------------------------------------- resume questions ---

  app.post('/api/resume/questions', resumeLimit, requireCap('llm'), requireAi,
    (req, res, next) => {
      upload.single('resume')(req, res, err => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'file too large — 2 MB maximum' });
        }
        return res.status(400).json({ error: 'could not read the upload' });
      });
    },
    wrap(async (req, res) => {
      if (!req.file) throw new BadRequest('no file uploaded');
      const text = await resume.extractText(req.file.buffer, req.file.mimetype, req.file.originalname);
      const model = await models.resolve(req.body?.model);
      // Questions and the candidate profile in parallel; a profile failure
      // must not cost the questions, so it degrades to null.
      const [result, profile] = await Promise.all([
        resume.generateQuestions(text, model),
        extractProfile(text, model).catch(() => null),
      ]);
      // The extracted text is deliberately not returned or retained.
      res.json({ ...result, profile });
    }));

}

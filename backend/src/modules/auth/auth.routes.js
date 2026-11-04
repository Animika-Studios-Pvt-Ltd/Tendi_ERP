import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import {
  changePasswordRateLimit,
  forgotPasswordRateLimit,
  loginRateLimit,
  resetPasswordRateLimit,
} from '../../middleware/authRateLimit.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './auth.controller.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from './auth.validator.js';

const router = Router();

router.post('/login', ...loginRateLimit, validate({ body: loginSchema }), controller.login);
router.post('/logout', controller.logout);
router.post('/forgot-password', ...forgotPasswordRateLimit, validate({ body: forgotPasswordSchema }), controller.forgotPassword);
router.post('/reset-password', ...resetPasswordRateLimit, validate({ body: resetPasswordSchema }), controller.resetPassword);

router.get('/me', authenticate, controller.me);
router.patch('/me', authenticate, validate({ body: updateProfileSchema }), controller.updateProfile);
router.post(
  '/change-password',
  authenticate,
  ...changePasswordRateLimit,
  validate({ body: changePasswordSchema }),
  controller.changePassword,
);

export default router;

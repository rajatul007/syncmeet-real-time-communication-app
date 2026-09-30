import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import UserModel, { type IUser } from '../models/User.ts';

export interface AuthRequest extends Request {
  user?: IUser;
}

const JWT_SECRET = process.env.JWT_SECRET || 'syncmeet_super_secret_production_key_2026';

export async function protect(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  let token: string | undefined;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.query && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    res.status(401).json({ success: false, message: 'Authentication required. No token provided.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
    const user = await UserModel.findById(decoded.id);

    if (!user) {
      res.status(401).json({ success: false, message: 'User associated with token no longer exists.' });
      return;
    }

    const { password, ...safeUser } = user;
    req.user = safeUser as IUser;
    next();
  } catch (err: any) {
    res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
}

export function generateToken(user: { _id: string; email: string }): string {
  return jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

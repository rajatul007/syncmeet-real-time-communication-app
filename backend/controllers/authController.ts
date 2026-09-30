import type { Response } from 'express';
import bcrypt from 'bcryptjs';
import UserModel from '../models/User.ts';
import { type AuthRequest, generateToken } from '../middleware/authMiddleware.ts';

export async function register(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, email, password, confirmPassword } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ success: false, message: 'Please provide full name, email, and password.' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
      return;
    }

    if (confirmPassword && password !== confirmPassword) {
      res.status(400).json({ success: false, message: 'Passwords do not match.' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
      return;
    }

    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      res.status(409).json({ success: false, message: 'An account with this email already exists.' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await UserModel.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      profileImage: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name.trim())}&backgroundColor=2563eb&textColor=ffffff`,
      role: 'user'
    });

    const token = generateToken(newUser);
    const { password: _, ...userSafe } = newUser;

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: userSafe
    });
  } catch (error: any) {
    console.error('[Auth Error] Register:', error);
    res.status(500).json({ success: false, message: 'Internal server error during registration.' });
  }
}

export async function login(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ success: false, message: 'Please provide email and password.' });
      return;
    }

    const user = await UserModel.findOne({ email: email.toLowerCase().trim() });
    if (!user || !user.password) {
      res.status(401).json({ success: false, message: 'Invalid email or password credentials.' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(401).json({ success: false, message: 'Invalid email or password credentials.' });
      return;
    }

    const token = generateToken(user);
    const { password: _, ...userSafe } = user;

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: userSafe
    });
  } catch (error: any) {
    console.error('[Auth Error] Login:', error);
    res.status(500).json({ success: false, message: 'Internal server error during login.' });
  }
}

export async function getMe(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    res.status(200).json({ success: true, user: req.user });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to fetch user profile.' });
  }
}

export async function updateProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { name, profileImage, currentPassword, newPassword } = req.body;
    const updates: any = {};

    if (name && name.trim()) {
      updates.name = name.trim();
    }
    if (profileImage !== undefined) {
      updates.profileImage = profileImage;
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        res.status(400).json({ success: false, message: 'New password must be at least 6 characters long.' });
        return;
      }
      const fullUser = await UserModel.findById(req.user._id);
      if (!fullUser || !fullUser.password) {
        res.status(400).json({ success: false, message: 'User record not found.' });
        return;
      }
      if (!currentPassword) {
        res.status(400).json({ success: false, message: 'Current password is required to set a new password.' });
        return;
      }
      const match = await bcrypt.compare(currentPassword, fullUser.password);
      if (!match) {
        res.status(400).json({ success: false, message: 'Current password does not match.' });
        return;
      }
      const salt = await bcrypt.genSalt(10);
      updates.password = await bcrypt.hash(newPassword, salt);
    }

    const updated = await UserModel.findByIdAndUpdate(req.user._id, updates);
    if (!updated) {
      res.status(404).json({ success: false, message: 'User not found.' });
      return;
    }

    const { password: _, ...userSafe } = updated;
    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: userSafe
    });
  } catch (error: any) {
    console.error('[Auth Error] Update profile:', error);
    res.status(500).json({ success: false, message: 'Internal error updating profile.' });
  }
}

export async function logout(req: AuthRequest, res: Response): Promise<void> {
  res.status(200).json({ success: true, message: 'Logged out successfully.' });
}

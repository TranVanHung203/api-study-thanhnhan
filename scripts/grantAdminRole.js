import mongoose from 'mongoose';
import 'dotenv/config';

import User from '../src/models/user.schema.js';

const parseArgs = (argv) => {
  const args = { userId: '', email: '' };

  for (const arg of argv) {
    if (arg.startsWith('--userId=')) {
      args.userId = arg.slice('--userId='.length).trim();
    } else if (arg.startsWith('--email=')) {
      args.email = arg.slice('--email='.length).trim().toLowerCase();
    }
  }

  return args;
};

const main = async () => {
  const { userId, email } = parseArgs(process.argv.slice(2));

  if (!process.env.MONGO_URI) {
    throw new Error('Missing MONGO_URI in environment variables');
  }

  if (!userId && !email) {
    throw new Error('Usage: npm run grant:admin -- --userId=<USER_ID> OR --email=<EMAIL>');
  }

  await mongoose.connect(process.env.MONGO_URI);

  try {
    let user = null;

    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new Error('Invalid userId format');
      }
      user = await User.findById(userId);
    }

    if (!user && email) {
      user = await User.findOne({ email });
    }

    if (!user) {
      throw new Error('User not found');
    }

    const normalizedRoles = Array.isArray(user.roles)
      ? user.roles.map((role) => String(role).toLowerCase())
      : [];

    if (!normalizedRoles.includes('admin')) {
      normalizedRoles.push('admin');
      user.roles = Array.from(new Set(normalizedRoles));
      await user.save();
      console.log(`Granted admin role to user ${user._id} (${user.email || user.username || 'no-identity'})`);
    } else {
      console.log(`User ${user._id} already has admin role`);
    }

    console.log(`Current roles: ${JSON.stringify(user.roles)}`);
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error('Grant admin failed:', error.message || error);
  process.exit(1);
});

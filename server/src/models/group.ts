import mongoose, { Document, Schema } from "mongoose";

export interface IGroup extends Document {
  name: string;
  description?: string;
  icon?: string;
  createdBy: mongoose.Types.ObjectId;
  members: {
    user: mongoose.Types.ObjectId;
    role: 'admin' | 'member';
    joinedAt: Date;
    unreadCount: number;
    lastReadAt: Date;
  }[];
  leftMembers: {
    user: mongoose.Types.ObjectId;
    leftAt: Date;
  }[];
  removedMembers: {
    user: mongoose.Types.ObjectId;
    removedAt: Date;
    removedBy: mongoose.Types.ObjectId;
  }[];
  latestMessage?: {
    messageId: mongoose.Types.ObjectId;
    text?: string;
    messageType: 'text' | 'image' | 'video' | 'system';
    sender: mongoose.Types.ObjectId;
    senderUsername?: string;
    createdAt: Date;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const groupSchema = new Schema<IGroup>({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  description: {
    type: String,
    trim: true,
    maxlength: 200
  },
  icon: {
    type: String,
    trim: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['admin', 'member'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    unreadCount: {
      type: Number,
      default: 0
    },
    lastReadAt: {
      type: Date,
      default: Date.now
    }
  }],
  leftMembers: [{
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    leftAt: {
      type: Date,
      default: Date.now
    }
  }],
  removedMembers: [{
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    removedAt: {
      type: Date,
      default: Date.now
    },
    removedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  }],
  latestMessage: {
    messageId: {
      type: Schema.Types.ObjectId,
      ref: 'Message'
    },
    text: String,
    messageType: {
      type: String,
      enum: ['text', 'image', 'video', 'system'],
      default: 'text'
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
groupSchema.index({ 'members.user': 1 });
groupSchema.index({ createdBy: 1 });

export default mongoose.model<IGroup>('Group', groupSchema);

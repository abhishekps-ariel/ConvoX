import mongoose, { Schema, Document } from "mongoose";

export interface IMessage extends Document {
  sender: mongoose.Types.ObjectId;
  receiver?: mongoose.Types.ObjectId; // Optional for group messages
  group?: mongoose.Types.ObjectId; // Optional for group messages
  text: string;
  imageUrl?: string;
  videoUrl?: string;
  messageType: 'text' | 'image' | 'video' | 'system';
  isRead: boolean;
  isEdited: boolean;
  editedAt?: Date;
  deletedForSender: boolean;
  deletedForReceiver: boolean;
  deletedForEveryone: boolean;
  deletedForUsers: mongoose.Types.ObjectId[];
  deletedAt?: Date;
  removedMemberId?: mongoose.Types.ObjectId; // For system messages about member removal
  createdAt: Date;
}

const MessageSchema: Schema = new Schema({
  sender: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  receiver: { 
    type: Schema.Types.ObjectId, 
    ref: 'User'
  },
  group: {
    type: Schema.Types.ObjectId,
    ref: 'Group'
  },
  text: { 
    type: String, 
    maxlength: 1000
  },
  imageUrl: {
    type: String
  },
  videoUrl: {
    type: String
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'video', 'system'],
    default: 'text'
  },
  isRead: {
    type: Boolean,
    default: false
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date
  },
  deletedForSender: {
    type: Boolean,
    default: false
  },
  deletedForReceiver: {
    type: Boolean,
    default: false
  },
  deletedForEveryone: {
    type: Boolean,
    default: false
  },
  deletedForUsers: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  deletedAt: {
    type: Date
  },
  removedMemberId: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Validation: Either receiver or group must be provided
MessageSchema.pre('validate', function(next) {
  if (!this.receiver && !this.group) {
    return next(new Error('Either receiver or group must be specified'));
  }
  if (this.receiver && this.group) {
    return next(new Error('Cannot specify both receiver and group'));
  }
  next();
});

export default mongoose.model<IMessage>("Message", MessageSchema);

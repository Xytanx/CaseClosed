const mongoose = require('mongoose');
const { Schema } = mongoose;

const requestSchema = new Schema({
    clientId: {
        type: Schema.Types.ObjectId,
        ref: 'client_profile',
        required: true
    },
    clientName: {
        type: String,
        required: true,
    },
    serviceProviderId: {
        type: Schema.Types.ObjectId,
        required: true
    },
    serviceProviderName: {
        type: String,
        required: true,
    },
    serviceProviderType: {
        type: String,
        enum: ['advocate', 'arbitrator', 'document_writer', 'mediator', 'notary'],
        required: true
    },
    requestMessage: {
        type: String,
        required: true
    },
    requestState: {
        type: String,
        enum: ['accepted', 'rejected', 'no response'],
        default: 'no response'
    },
    hire: {
        type: Boolean,
        default: false
    },
    completed: {
        type: Boolean,
        default: false
    },
    rating: {
        type: Number,
        min: 1,
        max: 5
    },
    review: {
        type: String
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Request', requestSchema);
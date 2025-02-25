const mongoose=require("mongoose");
const { Schema } = mongoose; // Destructure Schema from mongoose

const arbitrator_profile_Schema=new mongoose.Schema({
    username: { type: String, required: true },
    first_name: { type: String, required: true },
    last_name: { type: String, required: true },
    phone_no: { type: String, maxLength: 10, required: true },
    email_addr: { type: String, required: true },
    age: { type: Number, required: true },
    aadhar_no: { type: String, maxLength: 16, required: true },
    govt_verification_no: { type: String, required: true },
    password: { type: String, maxLength: 20, required: true },
    requestsReceived: [{
        type: Schema.Types.ObjectId,
        ref: 'Request'
    }],
    averageRating: {
        type: Number,
        default: 0,
        min: 0, // Ensure minimum rating is 0
        max: 5  // Ensure maximum rating is 5
    },
    totalRatings: {
        type: Number,
        default: 0
    }
});

const arbitrator_profile=mongoose.model("arbitrator_profile", arbitrator_profile_Schema);
module.exports=arbitrator_profile;
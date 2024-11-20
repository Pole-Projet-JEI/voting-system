import mongoose from "mongoose";

const voterSchema=new mongoose.Schema({
    code:{
        type:mongoose.Schema.Types.String,
        required:true,
        unique:true
    },
    votes:{
        type:mongoose.Schema.Types.Array,        
    },
    codeVotes:{
        type:mongoose.Schema.Types.Array,
    }

})

const Voter=mongoose.model("voters",voterSchema)
export default Voter;
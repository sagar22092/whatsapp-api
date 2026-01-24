import mongoose from "mongoose";
import bcrypt from "bcryptjs";
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

userSchema.pre("save", function () {
  if (!this.isModified("password")) {
    return
  }

  const salt = bcrypt.genSaltSync(10);
  this.password = bcrypt.hashSync(this.password, salt);

});

userSchema.methods.matchPassword = function (password) {
  return bcrypt.compareSync(password, this.password);
};

const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;

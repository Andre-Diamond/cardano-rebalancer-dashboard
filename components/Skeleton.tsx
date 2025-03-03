import React from "react";

interface Props {
  className?: string;
}

const Skeleton: React.FC<Props> = ({ className = "" }) => {
  return <div className={`animate-pulse bg-gray-300 ${className}`} />;
};

export default Skeleton;

import { BookOpen } from 'lucide-react';
import { Heading } from './ModelOperationsUI';



export default function MaterialsHeader({ children }) {
  return <div className="mo-materials-header mo-catalog-workbench">
    <Heading title={<><BookOpen/>模型资料</>}>{children}</Heading>

  </div>;
}

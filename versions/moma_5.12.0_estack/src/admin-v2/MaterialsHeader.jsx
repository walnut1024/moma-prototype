import { BookOpen } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Heading } from './ModelOperationsUI';
import { TARIFF_KINDS } from './tariff-dictionary';

const materialPages = [['model-templates', '模型'], ...Object.entries(TARIFF_KINDS)];

export default function MaterialsHeader({ active, ops, children }) {
  return <div className="mo-materials-header mo-catalog-workbench">
    <Heading title={<><BookOpen/>模型资料</>}>{children}</Heading>
    <Tabs value={active} onValueChange={id => ops.go(id === 'model-templates' ? {} : { tab: id }, { base: id === 'model-templates' ? id : 'tariff-dictionary', reset: id === 'model-templates' || active === 'model-templates' })}>
      <TabsList variant="line" className="mo-detail-tabs mo-materials-tabs" aria-label="资料分类">
        {materialPages.map(([id, label]) => <TabsTrigger key={id} value={id}>{label}</TabsTrigger>)}
      </TabsList>
    </Tabs>
  </div>;
}

import { TemplateConfigItem } from './template-config-item.interface';

export interface TemplateConfig {
    index: TemplateConfigItem;
    packageJson: TemplateConfigItem;
    request: TemplateConfigItem;
}

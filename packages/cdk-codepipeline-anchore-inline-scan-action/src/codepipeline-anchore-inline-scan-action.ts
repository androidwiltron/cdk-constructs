import { Construct } from '@aws-cdk/core';
import {
  BuildSpec,
  Cache,
  LocalCacheMode,
  LinuxBuildImage,
  PipelineProject,
  ComputeType,
} from '@aws-cdk/aws-codebuild';
import {
  ActionBindOptions,
  ActionCategory,
  ActionConfig,
  Artifact,
  CommonAwsActionProps,
  IStage,
} from '@aws-cdk/aws-codepipeline';
import { Action } from '@aws-cdk/aws-codepipeline-actions';
import { PolicyStatement } from '@aws-cdk/aws-iam';

export interface CodePipelineAnchoreInlineScanActionProps
  extends CommonAwsActionProps {
  /**
   * The source to use as input for this action.
   */
  readonly input: Artifact;

  /**
   * Version of anchore ci-tools
   *
   * @default v0.7.2
   */
  readonly version?: string;

  /**
   * Path to local Anchore policy bundle
   *
   * @default ./policy_bundle.json
   */
  readonly policyBundlePath?: string;

  /**
   * Specify timeout for image scanning in seconds.
   *
   * @default 300
   */
  readonly timeout?: number;

  /**
   * The type of compute to use for backup the repositories.
   * See the {@link ComputeType} enum for the possible values.
   *
   * @default taken from {@link LinuxBuildImage.STANDARD_4_0#defaultComputeType}
   */
  readonly computeType?: ComputeType;
}

export class CodePipelineAnchoreInlineScanAction extends Action {
  private readonly props: CodePipelineAnchoreInlineScanActionProps;

  constructor(props: CodePipelineAnchoreInlineScanActionProps) {
    super({
      ...props,
      category: ActionCategory.TEST,
      provider: 'CodeBuild',
      artifactBounds: {
        minInputs: 1,
        maxInputs: 1,
        minOutputs: 0,
        maxOutputs: 0,
      },
      inputs: [props.input],
    });

    this.props = props;
  }

  protected bound(
    scope: Construct,
    _stage: IStage,
    options: ActionBindOptions
  ): ActionConfig {
    const buildImage = LinuxBuildImage.STANDARD_4_0;

    const version = this.props.version ?? 'v0.7.2';

    const timeout = this.props.timeout ?? 300;

    const policyBundlePath =
      this.props.policyBundlePath ?? './policy_bundle.json';

    const url = `https://ci-tools.anchore.io/inline_scan-${version}`;

    const project = new PipelineProject(scope, 'VulnScanProject', {
      cache: Cache.local(LocalCacheMode.DOCKER_LAYER),
      environment: {
        buildImage,
        computeType: this.props.computeType || buildImage.defaultComputeType,
        privileged: true,
      },
      buildSpec: BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
              'echo Build started on `date`',
              'docker build -t image2scan:ci .',
              'echo Build completed on `date`',
            ],
          },
          build: {
            commands: [
              'echo Scan started on `date`',
              `curl -s ${url} | if [ -f "${policyBundlePath}" ]; then bash -s -- -f -t ${timeout} -b ${policyBundlePath} image2scan:ci; else bash -s -- -f -t ${timeout} image2scan:ci; fi`,
              'echo Scan completed on `date`',
            ],
          },
        },
      }),
    });

    // grant the Pipeline role the required permissions to this Project
    options.role.addToPolicy(
      new PolicyStatement({
        resources: [project.projectArn],
        actions: [
          'codebuild:BatchGetBuilds',
          'codebuild:StartBuild',
          'codebuild:StopBuild',
        ],
      })
    );

    // allow the Project access to the Pipeline's artifact Bucket
    // but only if the project is not imported
    // (ie., has a role) - otherwise, the IAM library throws an error
    if (project.role) {
      options.bucket.grantRead(project);
    }

    return {
      configuration: {
        ProjectName: project.projectName,
      },
    };
  }
}
